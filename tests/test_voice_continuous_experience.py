import pytest
from playwright.sync_api import sync_playwright
import http.server
import threading
import time

PORT = 8097

@pytest.fixture(scope="module")
def local_server():
    server = http.server.HTTPServer(('127.0.0.1', PORT), http.server.SimpleHTTPRequestHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    time.sleep(0.5)
    yield f"http://127.0.0.1:{PORT}"
    server.shutdown()

def test_voice_continuous_experience_and_smart_parser(local_server):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(f"{local_server}/index.html")
        page.wait_for_timeout(600)

        # 1. Открытие модального окна голосового ассистента
        page.click("#btn-voice-input")
        page.wait_for_timeout(300)
        assert page.evaluate("document.getElementById('modal-voice').classList.contains('open')"), "Модалка голоса не открылась"

        # 2. Проверка элементов мирового уровня (кнопка остановки, очистка, звуковые волны)
        has_finish_btn = page.evaluate("document.getElementById('btn-voice-finish-recording') !== null")
        has_waves = page.evaluate("document.getElementById('voice-sound-waves') !== null")
        has_clear = page.evaluate("document.querySelector('button[onclick*=\"clearVoiceText\"]') !== null")
        assert has_finish_btn, "Отсутствует кнопка 'Закончил говорить'"
        assert has_waves, "Отсутствует контейнер звуковых волн"
        assert has_clear, "Отсутствует кнопка очистки"

        # 3. Проверка настроек continuous и interimResults
        voice_config = page.evaluate('''() => {
            if (window.app && window.app.recognition) {
                return {
                    continuous: window.app.recognition.continuous,
                    interimResults: window.app.recognition.interimResults,
                    lang: window.app.recognition.lang
                };
            }
            return null;
        }''')
        # В безголовом браузере без нативного SpeechRecognition объект создается через mock или проверяется логика
        if voice_config:
            assert voice_config['continuous'] is True, "continuous должен быть true"
            assert voice_config['interimResults'] is True, "interimResults должен быть true"

        # 4. Проверка устойчивости к паузам и событиям no-speech
        page.evaluate('''() => {
            window.app.isRecordingVoice = true;
            window.app.voiceKeepAliveActive = true;
            if (window.app.recognition && window.app.recognition.onerror) {
                window.app.recognition.onerror({ error: 'no-speech' });
            }
        }''')
        status_after_pause = page.evaluate("document.getElementById('voice-status-text').innerText")
        assert "Жду продолжения мысли" in status_after_pause or "Слушаю" in status_after_pause, f"Неверный статус при паузе: {status_after_pause}"
        assert page.evaluate("window.app.isRecordingVoice === true"), "Запись не должна прерываться при паузе мастера"

        # 5. Проверка многосоставного накопления фразы с паузами
        page.evaluate('''() => {
            window.app.voiceAccumulatedText = 'Купил на Джами коллектор FAR';
            window.app.handleVoiceResult('Купил на Джами коллектор FAR за полтора миллиона');
        }''')
        recognized_val = page.evaluate("document.getElementById('voice-recognized-input').value")
        assert "Купил на Джами коллектор FAR за полтора миллиона" in recognized_val

        # 6. Проверка интеллектуального разбора сложных строительных сумм и узлов
        # Тест 6.1: Коллектор FAR за полтора миллиона
        parsed_material = page.evaluate("window.app.parseVoiceCommand('Купил на Джами коллектор FAR за полтора миллиона')")
        assert parsed_material['type'] == 'material'
        assert parsed_material['category'] == 'Коллекторы'
        assert parsed_material['amount'] == 1500000

        # Тест 6.2: Выплата помощнику с паузой и разговорной суммой («двести тысяч»)
        parsed_payout = page.evaluate("window.app.parseVoiceCommand('Выдал аванс сардору двести тысяч')")
        assert parsed_payout['type'] == 'brigade_pay'
        assert parsed_payout['recipient'] == 'Сардор'
        assert parsed_payout['amount'] == 200000

        # Тест 6.3: Аванс от клиента в сложной форме («два с половиной миллиона»)
        parsed_advance = page.evaluate("window.app.parseVoiceCommand('Клиент перевел аванс два с половиной миллиона')")
        assert parsed_advance['type'] == 'client_advance'
        assert parsed_advance['amount'] == 2500000

        # Тест 6.4: Опрессовка 16 бар
        parsed_press = page.evaluate("window.app.parseVoiceCommand('Гидравлическое испытание опрессовка 16 бар завершена')")
        assert parsed_press['type'] == 'press_test'

        # 7. Проверка очистки поля ввода
        page.click("button[onclick*='clearVoiceText']")
        assert page.evaluate("document.getElementById('voice-recognized-input').value") == ""
        assert page.evaluate("document.getElementById('voice-parse-preview').style.display") == "none"

        browser.close()
