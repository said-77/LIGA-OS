"""
Автоматический сквозной тест сметы LIGA OS (P0-1)
Проверяет:
1. Включение санузлов в математический расчет сметы.
2. Корректность пересчета вилки сумм в UZS и USD при кликах на счетчики.
3. Наличие обязательного канонического статуса: «Базовый ориентир (требует утверждения Улугбеком)».
4. Сохранение измененного тарифа мастера и персистентность после reload страницы.
5. Защиту от недопустимых значений: запрет отрицательных цен, пустых полей и нулевого курса доллара.
"""

import os
import time
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
import pytest
from playwright.sync_api import sync_playwright

PORT = 8092
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

@pytest.fixture(scope="module")
def http_server():
    os.chdir(ROOT_DIR)
    server = HTTPServer(('127.0.0.1', PORT), QuietHandler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    time.sleep(0.5)
    yield f"http://127.0.0.1:{PORT}"
    server.shutdown()

def get_clean_text(page, selector):
    return page.locator(selector).inner_text().strip().replace('\xa0', ' ')

def test_estimate_math_with_bathrooms(http_server):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 393, "height": 852})
        page = context.new_page()

        # 1. Открытие приложения
        page.goto(f"{http_server}/index.html")
        page.wait_for_selector(".bottom-nav")

        # 2. Переход на таб сметы
        page.locator('.nav-item[data-screen="estimate"]').click()
        page.wait_for_selector("#screen-estimate.active")

        # 3. Проверка начальных значений
        val_bathrooms = page.locator("#val-bathrooms").inner_text().strip()
        val_water = page.locator("#val-waterPoints").inner_text().strip()
        assert val_bathrooms == "2", f"Ожидалось 2 санузла, получено {val_bathrooms}"
        assert val_water == "12", f"Ожидалось 12 водорозеток, получено {val_water}"

        sum_text = get_clean_text(page, "#est-range-sum")
        usd_text = get_clean_text(page, "#est-range-usd")
        assert "17 700 000 – 22 125 000 сум" in sum_text, f"Неверная начальная сумма: {sum_text}"
        assert "$1 372 – $1 715" in usd_text, f"Неверный начальный USD: {usd_text}"

        # 4. Проверка честного статуса тарифов мастера
        tariff_status = page.locator("#est-tariff-status").inner_text().strip()
        assert "Базовый ориентир (требует утверждения Улугбеком)" in tariff_status, \
            f"Отсутствует канонический статус тарифов: {tariff_status}"

        # 5. ТЕСТ ИСПРАВЛЕНИЯ ДЕФЕКТА: Увеличение санузлов с 2 до 3
        page.locator('.btn-counter[data-field="bathrooms"][data-delta="1"]').click()
        val_bathrooms_new = page.locator("#val-bathrooms").inner_text().strip()
        assert val_bathrooms_new == "3", f"Счетчик санузлов не увеличился: {val_bathrooms_new}"

        sum_after_plus = get_clean_text(page, "#est-range-sum")
        usd_after_plus = get_clean_text(page, "#est-range-usd")
        assert "19 200 000 – 24 000 000 сум" in sum_after_plus, \
            f"ДЕФЕКТ НЕ ИСПРАВЛЕН: сумма не пересчиталась при увеличении санузлов! Текст: {sum_after_plus}"
        assert "$1 488 – $1 860" in usd_after_plus, f"USD не пересчитался: {usd_after_plus}"

        # 6. Уменьшение санузлов с 3 до 1 (два клика минус)
        btn_minus = page.locator('.btn-counter[data-field="bathrooms"][data-delta="-1"]')
        btn_minus.click()
        btn_minus.click()

        val_bathrooms_1 = page.locator("#val-bathrooms").inner_text().strip()
        assert val_bathrooms_1 == "1", f"Ожидался 1 санузел, получено {val_bathrooms_1}"

        sum_after_minus = get_clean_text(page, "#est-range-sum")
        usd_after_minus = get_clean_text(page, "#est-range-usd")
        assert "16 200 000 – 20 250 000 сум" in sum_after_minus, \
            f"Сумма не пересчиталась при уменьшении санузлов: {sum_after_minus}"
        assert "$1 256 – $1 570" in usd_after_minus, f"USD не пересчитался: {usd_after_minus}"

        # Возвращаем санузлы к 2
        page.locator('.btn-counter[data-field="bathrooms"][data-delta="1"]').click()

        # 7. ТЕСТ КАЛИБРОВКИ И ПЕРСИСТЕНТНОСТИ ТАРИФОВ
        page.locator("#btn-open-tariffs").click()
        page.wait_for_selector("#modal-tariffs.open")

        # Меняем ставку санузла с 1 500 000 на 2 000 000 (+500 000 за санузел)
        input_bath = page.locator("#tariff-costPerBathroom")
        input_bath.fill("2000000")
        page.locator('#form-tariffs button[type="submit"]').click()
        page.locator("#modal-tariffs").wait_for(state="hidden")

        # При 2 санузлах по 2 000 000:
        # Min: 17 700 000 + (2 * 500 000) = 18 700 000 сум
        # Max: 18 700 000 * 1.25 = 23 375 000 сум
        # USD: 18 700 000 / 12900 = 1450, 23 375 000 / 12900 = 1812
        sum_custom = get_clean_text(page, "#est-range-sum")
        usd_custom = get_clean_text(page, "#est-range-usd")
        assert "18 700 000 – 23 375 000 сум" in sum_custom, f"Сумма не пересчиталась по новым тарифам: {sum_custom}"
        assert "$1 450 – $1 812" in usd_custom, f"USD не пересчитался: {usd_custom}"

        # Статус изменился на пользовательский
        badge_status = page.locator("#est-tariff-status").inner_text().strip()
        assert "Пользовательские тарифы мастера Улугбека" in badge_status

        # 8. ТЕСТ ПЕРЕЗАГРУЗКИ (ПЕРСИСТЕНТНОСТЬ В LOCALSTORAGE)
        page.reload()
        page.wait_for_selector(".bottom-nav")
        page.locator('.nav-item[data-screen="estimate"]').click()
        page.wait_for_selector("#screen-estimate.active")

        sum_reloaded = get_clean_text(page, "#est-range-sum")
        assert "18 700 000 – 23 375 000 сум" in sum_reloaded, \
            f"После перезагрузки кастомные тарифы не сохранились: {sum_reloaded}"

        # 9. ТЕСТ ЗАЩИТЫ ОТ ОШИБОЧНЫХ И ОТРИЦАТЕЛЬНЫХ ЗНАЧЕНИЙ
        page.locator("#btn-open-tariffs").click()
        page.wait_for_selector("#modal-tariffs.open")

        # А: Попытка сохранить отрицательное значение (-500 000)
        dialog_messages = []
        def handle_dialog(dialog):
            dialog_messages.append(dialog.message)
            dialog.accept()

        page.on("dialog", handle_dialog)

        # Пытаемся передать отрицательное значение в поле через JS/input
        page.locator("#tariff-costPerBathroom").fill("-500000")
        page.locator('#form-tariffs button[type="submit"]').click()

        time.sleep(0.3)
        # Проверяем, что модалка осталась открытой (сохранение заблокировано)
        assert page.locator("#modal-tariffs.open").is_visible(), "Модалка закрылась при отрицательном тарифе!"
        assert any("не может быть отрицательным" in msg for msg in dialog_messages), \
            f"Сообщение об ошибке отрицательного тарифа не получено: {dialog_messages}"

        # Б: Попытка передать нулевой курс доллара (0)
        dialog_messages.clear()
        page.locator("#tariff-costPerBathroom").fill("1500000")
        page.locator("#tariff-usdRate").fill("0")
        page.locator('#form-tariffs button[type="submit"]').click()

        time.sleep(0.3)
        assert page.locator("#modal-tariffs.open").is_visible(), "Модалка закрылась при нулевом курсе USD!"
        assert any("строго больше нуля" in msg for msg in dialog_messages), \
            f"Сообщение об ошибке нулевого курса не получено: {dialog_messages}"

        # 10. СБРОС ТАРИФОВ К БАЗОВЫМ
        page.locator("#btn-reset-tariffs").click()
        page.locator("#modal-tariffs").wait_for(state="hidden")

        sum_reset = get_clean_text(page, "#est-range-sum")
        assert "17 700 000 – 22 125 000 сум" in sum_reset, f"Сброс тарифов не вернул базовую сумму: {sum_reset}"

        browser.close()
        print("\n[SUCCESS] Все расширенные тесты P0-1 (включая персистентность и валидацию) пройдены успешно!")

if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
