"""Build a narrated MP4 from the current LIGA OS interface (Windows/SAPI)."""
from __future__ import annotations

import http.server
import os
import socketserver
import subprocess
import tempfile
import threading
import time
import wave
from pathlib import Path

import win32com.client
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / "demo"
FINAL = DEMO / "liga_os_full_guide.mp4"
FFMPEG = Path(subprocess.check_output(["where.exe", "ffmpeg"], text=True).splitlines()[0])

SCENES = [
    ("dashboard", "Выберите нужный объект и проверьте его название. Быстрые действия помогают начать работу, а данные объекта сохраняются в браузере на этом устройстве."),
    ("finances", "В разделе Финансы записываются договор, авансы и расходы. Остаток рассчитывается по внесённым суммам. Сверяйте сумму и объект до сохранения."),
    ("materials", "В Складе ведите список материалов по объекту: указывайте наименование, количество, фактическую цену и статус закупки."),
    ("checklist", "В Контроле отмечайте только выполненные проверки. Давление и время испытания выбираются для системы, проекта и условий этого объекта."),
    ("estimate", "Смета считает по введённым количествам и тарифам. Это расчётная основа: перед согласованием проверьте состав работ и цену."),
    ("seal", "Фирменная печать оформляет документ, но не заменяет сертификат и не подтверждает испытание. Подпись рисует мастер; шаблон пера не является электронной подписью."),
]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, *_args):
        pass


class LocalServer(socketserver.TCPServer):
    allow_reuse_address = True


def synthesize_narration(audio_dir: Path) -> list[float]:
    speaker = win32com.client.Dispatch("SAPI.SpVoice")
    for voice in speaker.GetVoices():
        if "irina" in voice.GetDescription().lower():
            speaker.Voice = voice
            break
    speaker.Rate = -1
    speaker.Volume = 100
    durations: list[float] = []

    for index, (_screen, text) in enumerate(SCENES, start=1):
        path = audio_dir / f"scene_{index:02d}.wav"
        stream = win32com.client.Dispatch("SAPI.SpFileStream")
        stream.Open(str(path), 3, False)
        speaker.AudioOutputStream = stream
        speaker.Speak(text)
        stream.Close()
        speaker.AudioOutputStream = None
        with wave.open(str(path), "rb") as audio:
            durations.append(audio.getnframes() / audio.getframerate())
    return durations


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="liga_guide_") as temp:
        temp_dir = Path(temp)
        audio_dir = temp_dir / "audio"
        video_dir = temp_dir / "video"
        audio_dir.mkdir()
        video_dir.mkdir()
        durations = synthesize_narration(audio_dir)

        server = LocalServer(("127.0.0.1", 0), QuietHandler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        base = f"http://127.0.0.1:{server.server_address[1]}"
        raw_video: Path | None = None
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(headless=True)
                context = browser.new_context(
                    viewport={"width": 412, "height": 915},
                    device_scale_factor=1,
                    is_mobile=True,
                    has_touch=True,
                    reduced_motion="reduce",
                    record_video_dir=str(video_dir),
                    record_video_size={"width": 412, "height": 915},
                )
                page = context.new_page()
                page.goto(f"{base}/index.html", wait_until="networkidle")
                page.wait_for_function("() => window.app && window.ligaDB && window.ligaDB.db")
                page.wait_for_timeout(700)

                for index, ((screen, _text), duration) in enumerate(zip(SCENES, durations), start=1):
                    if screen == "seal":
                        page.locator("#btn-settings-top").click()
                        page.wait_for_selector("#modal-settings.open")
                        page.locator("#settings-section-seal").scroll_into_view_if_needed()
                        page.wait_for_timeout(700)
                        page.locator("#btn-sig-preset-elegant").click()
                        page.wait_for_timeout(2600)
                    else:
                        page.locator(f'.nav-item[data-screen="{screen}"]').click()
                    page.wait_for_timeout(200)
                    time.sleep(duration + 1.1)

                raw_video = Path(page.video.path())
                context.close()
                browser.close()
        finally:
            server.shutdown()
            server.server_close()

        if raw_video is None or not raw_video.exists():
            raise RuntimeError("Browser recording was not created")

        audio_list = temp_dir / "audio_list.txt"
        with audio_list.open("w", encoding="utf-8") as output:
            for index in range(1, len(SCENES) + 1):
                output.write(f"file '{(audio_dir / f'scene_{index:02d}.wav').as_posix()}'\n")
        narration = temp_dir / "narration.wav"
        subprocess.run(
            [str(FFMPEG), "-y", "-f", "concat", "-safe", "0", "-i", str(audio_list), "-c:a", "pcm_s16le", str(narration)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        subprocess.run(
            [
                str(FFMPEG), "-y", "-i", str(raw_video), "-i", str(narration),
                "-vf", "fps=24,scale=trunc(iw/2)*2:trunc(ih/2)*2",
                "-c:v", "libx264", "-preset", "fast", "-crf", "24",
                "-c:a", "aac", "-b:a", "128k", "-pix_fmt", "yuv420p",
                "-movflags", "+faststart", "-shortest", str(FINAL),
            ],
            check=True,
        )
    print(f"Created {FINAL} ({FINAL.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
