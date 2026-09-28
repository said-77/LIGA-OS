"""
LIGA OS v2.4.8 — Full Automated Video Producer
Генерирует настоящее MP4 видео с озвучкой диктором и живыми действиями в интерфейсе.
"""

import os
import sys
import time
import subprocess
import win32com.client
from playwright.sync_api import sync_playwright

import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
AUDIO_DIR = os.path.join(BASE_DIR, "audio")
VIDEOS_DIR = os.path.join(BASE_DIR, "videos")
FINAL_MP4 = os.path.join(BASE_DIR, "liga_os_full_guide.mp4")

os.makedirs(AUDIO_DIR, exist_ok=True)
os.makedirs(VIDEOS_DIR, exist_ok=True)

# 1. ГЕНЕРАЦИЯ ГОЛОСОВЫХ ДОРОЖЕК
print("[1/4] Генерация профессиональной русской озвучки...")

speaker = win32com.client.Dispatch("SAPI.SpVoice")
for voice in speaker.GetVoices():
    desc = voice.GetDescription()
    if "irina" in desc.lower() or "russian" in desc.lower():
        speaker.Voice = voice
        break

speaker.Rate = 0  # Естественный темп
speaker.Volume = 100

chapters = [
    {
        "id": "ch1_intro",
        "text": "Добро пожаловать в LIGA OS — операционную систему ведущего инженера сантехники и отопления Улугбека Хакимова. Вся база работает автономно без интернета на вашем смартфоне. Перед вами объект жилой комплекс Mirabad Avenue.",
        "pad_after": 2.0
    },
    {
        "id": "ch2_finances",
        "text": "Раздел Финансы. Точный учет каждого сума: общая сумма договора, внесенные авансы и остаток долга. Модуль Базарный карман Урикзор защищает личные деньги мастера от строительных расходов.",
        "pad_after": 2.0
    },
    {
        "id": "ch3_materials",
        "text": "Склад и комплектация. Учет труб Рехау Раутитан, коллекторов ФАР и аксиальных гильз. Реальные оптовые закупочные цены надежно защищены от посторонних глаз.",
        "pad_after": 2.0
    },
    {
        "id": "ch4_quality",
        "text": "Главный стандарт надежности Лиги — гидравлические испытания шестнадцать бар в течение двадцати четырех часов. Фотофиксация манометра до заливки стяжки исключает любые протечки.",
        "pad_after": 2.5
    },
    {
        "id": "ch5_seal",
        "text": "Официальная швейцарская гербовая печать королевского класса Swiss Imperial Gold и цифровая роспись мастера прямо на экране смартфона для заверения Актов опрессовки и Паспорта объекта.",
        "pad_after": 2.5
    },
    {
        "id": "ch6_outro",
        "text": "LIGA OS — надежность швейцарского банка в каждой инженерной системе. Система готова к работе на любых элитных объектах.",
        "pad_after": 3.0
    }
]

durations = []

for ch in chapters:
    wav_path = os.path.join(AUDIO_DIR, f"{ch['id']}.wav")
    filestream = win32com.client.Dispatch("SAPI.SpFileStream")
    filestream.Open(wav_path, 3, False)
    speaker.AudioOutputStream = filestream
    speaker.Speak(ch["text"])
    filestream.Close()
    speaker.AudioOutputStream = None

    # Определение длительности аудио через стандартный модуль wave
    import wave
    with wave.open(wav_path, 'rb') as wf:
        dur = wf.getnframes() / float(wf.getframerate())
    ch["duration"] = dur
    ch["total_time"] = dur + ch["pad_after"]
    print(f"  [OK] {ch['id']}: {dur:.1f} sec (total with pad: {ch['total_time']:.1f} sec)")

# 2. ЗАПИСЬ ВИДЕО ЧЕРЕЗ PLAYWRIGHT
print("\n🎬 [2/4] Запись живого видео интерфейса LIGA OS...")

# Запуск локального HTTP сервера на порту 8766 для надежности
import http.server
import socketserver
import threading

PORT = 8766
ROOT_DIR = os.path.abspath(os.path.join(BASE_DIR, ".."))

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)
    def log_message(self, format, *args):
        pass

server = socketserver.TCPServer(("", PORT), QuietHandler)
srv_thread = threading.Thread(target=server.serve_forever, daemon=True)
srv_thread.start()
time.sleep(1)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={"width": 412, "height": 915},
        device_scale_factor=2,
        is_mobile=True,
        has_touch=True,
        record_video_dir=VIDEOS_DIR,
        record_video_size={"width": 412, "height": 915}
    )
    page = context.new_page()

    # Сцена 1: Вступление и Дашборд
    print("  -> Сцена 1: Главный экран (Дашборд)...")
    page.goto(f"http://localhost:{PORT}/index.html", wait_until="networkidle")
    time.sleep(2)
    # Медленный красивый скролл дашборда
    page.evaluate("window.scrollBy({ top: 350, behavior: 'smooth' })")
    time.sleep(chapters[0]["total_time"] - 4.5)
    page.evaluate("window.scrollTo({ top: 0, behavior: 'smooth' })")
    time.sleep(2.5)

    # Сцена 2: Финансы и Drill-Down
    print("  -> Сцена 2: Финансы, касса и Базарный карман...")
    page.click(".nav-item[data-screen='finances']")
    time.sleep(1.5)
    # Подсветка строки аванса (12 млн)
    page.evaluate("""() => {
        const row = document.getElementById('row-fin-advance');
        if (row) {
            row.classList.add('drilldown-active-target');
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }""")
    time.sleep(chapters[1]["total_time"] - 3.5)
    page.evaluate("window.scrollBy({ top: 200, behavior: 'smooth' })")
    time.sleep(2.0)

    # Сцена 3: Склад и материалы
    print("  -> Сцена 3: Склад и комплектация Rehau/FAR...")
    page.click(".nav-item[data-screen='materials']")
    time.sleep(1.5)
    page.evaluate("window.scrollBy({ top: 250, behavior: 'smooth' })")
    time.sleep(chapters[2]["total_time"] - 3.5)
    page.evaluate("window.scrollTo({ top: 0, behavior: 'smooth' })")
    time.sleep(2.0)

    # Сцена 4: Контроль и Опрессовка 16 бар
    print("  -> Сцена 4: Чек-лист и протокол 16 бар...")
    page.click(".nav-item[data-screen='checklist']")
    time.sleep(1.5)
    page.evaluate("""() => {
        if (window.app && typeof window.app.openPressureTestModal === 'function') {
            window.app.openPressureTestModal();
        }
    }""")
    time.sleep(chapters[3]["total_time"] - 3.0)
    page.evaluate("""() => {
        if (window.app && typeof window.app.closeModal === 'function') {
            window.app.closeModal('modal-pressure-test');
        }
    }""")
    time.sleep(1.5)

    # Сцена 5: Настройки, Гербовая печать и Подпись мастера
    print("  -> Сцена 5: Гербовая печать и Canvas подпись...")
    page.click(".nav-item[data-screen='dashboard']")
    time.sleep(1.0)
    page.click("#btn-settings-top")
    time.sleep(1.5)
    # Скролл к секции печати
    page.evaluate("""() => {
        const sheet = document.querySelector('#modal-settings .modal-sheet');
        if (sheet) sheet.scrollTop = 1200;
    }""")
    time.sleep(2.0)
    # Применение красивого вензеля
    page.evaluate("""() => {
        if (window.app && typeof window.app.applySignaturePreset === 'function') {
            window.app.applySignaturePreset('elegant');
        }
    }""")
    time.sleep(chapters[4]["total_time"] - 6.0)
    # Закрытие настроек
    page.evaluate("""() => {
        if (window.app && typeof window.app.closeModal === 'function') {
            window.app.closeModal('modal-settings');
        }
    }""")
    time.sleep(2.0)

    # Сцена 6: Завершение на главном экране
    print("  -> Сцена 6: Финал...")
    page.evaluate("window.scrollTo({ top: 0, behavior: 'smooth' })")
    time.sleep(chapters[5]["total_time"])

    # Закрытие страницы для завершения записи видео
    video_path = page.video.path()
    context.close()
    browser.close()

server.shutdown()
print(f"  [OK] Raw video recorded: {video_path}")

# 3. МОНТАЖ И СВЕДЕНИЕ АУДИО И ВИДЕО ЧЕРЕЗ FFMPEG
print("\n[3/4] Audio stitching and MP4 encoding...")

# Создаем список аудиофайлов с паузами
audio_list_file = os.path.join(AUDIO_DIR, "audio_list.txt")
with open(audio_list_file, "w", encoding="utf-8") as f:
    for ch in chapters:
        wav_p = os.path.join(AUDIO_DIR, f"{ch['id']}.wav").replace("\\", "/")
        f.write(f"file '{wav_p}'\n")

# Склеиваем аудио в один файл
full_audio_wav = os.path.join(AUDIO_DIR, "full_narration.wav")
subprocess.run([
    "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", audio_list_file,
    "-c", "pcm_s16le", full_audio_wav
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

# Сводим видео WebM и аудио в финальный MP4
print(f"  -> Rendering final MP4: {FINAL_MP4}")
cmd_merge = [
    "ffmpeg", "-y",
    "-i", video_path,
    "-i", full_audio_wav,
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "22",
    "-c:a", "aac",
    "-b:a", "192k",
    "-pix_fmt", "yuv420p",
    "-shortest",
    FINAL_MP4
]

res = subprocess.run(cmd_merge, capture_output=True, text=True)
if res.returncode == 0 and os.path.exists(FINAL_MP4):
    mp4_size_mb = os.path.getsize(FINAL_MP4) / (1024 * 1024)
    print(f"\n[4/4] FULL VIDEO GENERATED SUCCESSFULLY!")
    print(f"  File: {FINAL_MP4}")
    print(f"  Size: {mp4_size_mb:.2f} MB")
else:
    print(f"FFmpeg error: {res.stderr}")
    sys.exit(1)

