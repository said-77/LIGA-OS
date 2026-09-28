import os
import glob
import subprocess
import json
import shutil

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS_DIR = os.path.join(ROOT_DIR, 'demo', 'assets')
TEMP_DIR = os.path.join(ROOT_DIR, 'demo', 'temp_render')
OUTPUT_VIDEO = os.path.join(ROOT_DIR, 'demo', 'liga_os_full_guide.mp4')
ROOT_VIDEO = os.path.join(ROOT_DIR, 'liga_os_full_guide.mp4')

SCENES = [
    {
        "id": "01",
        "image": "01_dashboard.png",
        "title": "ГЛАВНЫЙ ЭКРАН МАСТЕРА",
        "text": "Добро пожаловать в LIGA OS — персональную операционную систему ведущего инженера сантехники и отопления в Ташкенте. Никаких записок на коленке: управление объектом в один клик прямо со смартфона."
    },
    {
        "id": "02",
        "image": "02_finances.png",
        "title": "ФИНАНСЫ И КАССА ОБЪЕКТА",
        "text": "Раздел Финансы: полный контроль кассы объекта. Учет авансов, закупка материалов, суточные расходы и чистая прибыль мастера."
    },
    {
        "id": "03",
        "image": "03_materials.png",
        "title": "ИНЖЕНЕРНЫЙ СКЛАД",
        "text": "Инженерный склад: учет всех фитингов, коллекторов FAR, труб из сшитого полиэтилена и запорной арматуры. Списание по факту монтажа без потерь."
    },
    {
        "id": "04",
        "image": "04_checklist.png",
        "title": "КОНТРОЛЬ КАЧЕСТВА И СНиП",
        "text": "Контроль качества: строгие инженерные чек-листы. Проверка крепежа, соосности, уклонов канализации и скрытых узлов до заливки стяжки."
    },
    {
        "id": "05",
        "image": "05_estimate.png",
        "title": "СМЕТА И РАСЧЕТ РАБОТ",
        "text": "Смета и расценки: прозрачный расчет стоимости монтажа водоснабжения, канализации и теплых полов. Точный прайс, вызывающий доверие клиентов."
    },
    {
        "id": "06",
        "image": "06_history.png",
        "title": "ЖУРНАЛ И СКРЫТЫЕ РАБОТЫ",
        "text": "Журнал истории: пошаговая фотофиксация каждого скрытого узла до монолитных работ. Вся хронология монтажа сохраняется в памяти системы навсегда."
    },
    {
        "id": "07",
        "image": "07_settings.png",
        "title": "НАСТРОЙКИ И БРЕНДИНГ",
        "text": "Персональные настройки: переключение темы Тёмный Титан и Светлая Керамика, выбор стиля официальной печати мастера и защита персональных данных."
    },
    {
        "id": "08",
        "image": "08_seal_preview.png",
        "title": "ЭЛИТНАЯ ПЕЧАТЬ МАСТЕРА",
        "text": "Генератор элитных печатей: Золотой VIP, Дипломатический титан или Синяя мастика с защитным микроузором Ташкент Стандарт Elite."
    },
    {
        "id": "09",
        "image": "09_signature_pad.png",
        "title": "УМНАЯ ПОДПИСЬ БЕЗЬЕ",
        "text": "Модуль электронной подписи: благодаря умному сглаживанию Безье даже подпись пальцем на экране смартфона ложится ровно и элегантно."
    },
    {
        "id": "10",
        "image": "10_pressure_act.png",
        "title": "АКТ 16 БАР И ПАСПОРТ А4",
        "text": "Вершина надежности — Акт гидравлических испытаний на шестнадцать бар в течение двадцати четырех часов и официальный Инженерный Паспорт для клиента."
    },
    {
        "id": "11",
        "image": "11_more_menu.png",
        "title": "ПУЛЬТ МАСТЕРА И ОФЛАЙН",
        "text": "Инженерный пульт мастера: база данных работает полностью офлайн прямо на вашем устройстве. LIGA OS — швейцарский банк ваших инженерных систем!"
    }
]

def get_audio_duration(file_path):
    cmd = ['ffmpeg', '-i', file_path]
    res = subprocess.run(cmd, stderr=subprocess.PIPE, text=True, errors='ignore')
    for line in res.stderr.splitlines():
        if 'Duration:' in line:
            parts = line.split('Duration:')[1].split(',')[0].strip()
            h, m, s = parts.split(':')
            return float(h)*3600 + float(m)*60 + float(s)
    return 8.0

def main():
    os.makedirs(TEMP_DIR, exist_ok=True)
    segment_files = []
    
    print("=== 1. Генерация нейронного голоса через Microsoft ru-RU-DmitryNeural ===")
    for idx, scene in enumerate(SCENES):
        audio_file = os.path.join(TEMP_DIR, f"audio_{scene['id']}.mp3")
        print(f"[{idx+1}/11] Озвучка для сцены {scene['id']}: {scene['title']}...")
        
        # Генерация через edge-tts CLI с естественным голосом Dmitry
        cmd_tts = [
            'edge-tts',
            '--voice', 'ru-RU-DmitryNeural',
            '--rate', '+0%',
            '--pitch', '+0Hz',
            '--text', scene['text'],
            '--write-media', audio_file
        ]
        res = subprocess.run(cmd_tts, capture_output=True, text=True)
        if res.returncode != 0:
            print(f"Ошибка edge-tts для сцены {scene['id']}: {res.stderr}")
            # Fallback на gTTS если edge-tts недоступен
            from gtts import gTTS
            tts = gTTS(scene['text'], lang='ru')
            tts.save(audio_file)
            
        dur = get_audio_duration(audio_file)
        # Добавляем 0.6 секунды паузы после фразы
        scene_duration = dur + 0.6
        print(f"   Длительность аудио: {dur:.2f} сек. Сцена: {scene_duration:.2f} сек.")
        
        # Создаем видеосегмент
        image_path = os.path.join(ASSETS_DIR, scene['image'])
        segment_video = os.path.join(TEMP_DIR, f"segment_{scene['id']}.mp4")
        
        # FFmpeg: масштабируем скриншот в 480x1040 (красивый мобильный экран), центрируем на темном фоне
        # Добавляем аудиодорожку с небольшим хвостиком тишины
        cmd_ffmpeg = [
            'ffmpeg', '-y',
            '-loop', '1', '-i', image_path,
            '-i', audio_file,
            '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
            '-vf', 'scale=480:1040:force_original_aspect_ratio=decrease,pad=480:1040:(ow-iw)/2:(oh-ih)/2:color=#060911,format=yuv420p',
            '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
            '-t', str(scene_duration),
            segment_video
        ]
        res_ff = subprocess.run(cmd_ffmpeg, capture_output=True, text=True)
        if res_ff.returncode != 0:
            print(f"Ошибка рендера сцены {scene['id']}: {res_ff.stderr}")
            return
            
        segment_files.append(segment_video)
        print(f"   Сегмент {scene['id']} готов: {segment_video}")

    print("\n=== 2. Склейка всех 11 сцен в итоговый фильм ===")
    concat_list = os.path.join(TEMP_DIR, 'concat_list.txt')
    with open(concat_list, 'w', encoding='utf-8') as f:
        for seg in segment_files:
            # Преобразуем путь для ffmpeg
            f.write(f"file '{seg.replace(chr(92), '/')}'\n")

    cmd_concat = [
        'ffmpeg', '-y',
        '-f', 'concat', '-safe', '0',
        '-i', concat_list,
        '-c', 'copy',
        '-movflags', '+faststart',
        OUTPUT_VIDEO
    ]
    res_concat = subprocess.run(cmd_concat, capture_output=True, text=True)
    if res_concat.returncode != 0:
        print(f"Ошибка склейки: {res_concat.stderr}")
        return

    # Копируем в корень репозитория
    shutil.copy2(OUTPUT_VIDEO, ROOT_VIDEO)
    
    total_dur = get_audio_duration(OUTPUT_VIDEO)
    size_mb = os.path.getsize(OUTPUT_VIDEO) / (1024 * 1024)
    print(f"\n УСПЕХ! Итоговое видео создано:")
    print(f"   Файл: {OUTPUT_VIDEO}")
    print(f"   Длительность: {total_dur:.1f} сек")
    print(f"   Размер: {size_mb:.2f} МБ")
    print(f"   Скопировано в: {ROOT_VIDEO}")

if __name__ == '__main__':
    main()
