# Лицензии и авторы звука, попавшего в сборку игры

Здесь лежат только те файлы, которые игра действительно грузит. Полный
набор, из которого они отобраны (48 записей атмосферы и 10 музыкальных
треков), хранится в `assets-research/audio/` вместе с подробной таблицей
источников и в сборку не попадает.

**Всё содержимое этого каталога — CC0 1.0 Universal либо синтезировано
для этой игры.** Ни одного файла под CC BY, CC BY-NC, CC BY-SA, GPL или
собственной лицензией площадки здесь нет: атрибуция не обязательна
формально, экран титров игре не нужен. Авторы всё равно названы —
это стоит одной строки, а вернуться к оригиналу за полным качеством
без ссылки невозможно.

- Текст CC0: https://creativecommons.org/publicdomain/zero/1.0/
- Юридический текст: https://creativecommons.org/publicdomain/zero/1.0/legalcode

**Что сделано с файлами.** Все перекодированы в MP3 96 кбит/с; разовые
звуки сведены в моно и вырезаны из более длинных записей; петли атмосферы
сшиты в кольцо кроссфейдом хвоста с началом; громкость выровнена
(музыка и атмосфера — по EBU R128, разовые звуки — по пику). Точные
границы кусков и параметры — в `tools/build-audio.mjs`, пересобрать
можно командой `node tools/build-audio.mjs`.

---

## Музыка — `music/`

| Файл | Оригинал | Автор | Лицензия | Источник |
|---|---|---|---|---|
| `day.mp3` | Calm Piano 1 (Vaporware) | cynicmusic (Kevin Phelan) | CC0 1.0 | https://opengameart.org/content/calm-piano-1-vaporware |
| `session.mp3` | Yoiyami Core Theme (Deep Blue Ambient Piano) | yoiyami | CC0 1.0 | https://opengameart.org/content/yoiyami-core-theme-%E2%80%93-deep-blue-ambient-piano |
| `night.mp3` | Forget Me Not (in F major, looped) | kistol | CC0 1.0 | https://opengameart.org/content/forget-me-not |
| `epilogue.mp3` | First Light Particles | yoiyami | CC0 1.0 | https://opengameart.org/content/first-light-particles-%E2%80%93-cc0-atmospheric-pianoambient-track |
| `lounge.mp3` | — | синтезировано для этой игры | обязательств нет | `assets-research/audio/proto-src/music.py` |
| `lesson.mp3` | — | синтезировано для этой игры | обязательств нет | `assets-research/audio/proto-src/music.py` |

`lounge.mp3` и `lesson.mp3` — генеративное FM-электропиано, написанное
с нуля для этого проекта (см. research/assets-audio.md, раздел 3.1).
Ни одного стороннего сэмпла в них нет.

---

## Атмосфера — `ambience/`

Источник всех записей — [Freesound](https://freesound.org/), **все CC0 1.0**.
Лицензия каждой проверена открытием страницы файла, а не взята из фильтра
поиска.

| Файл | Оригинал | Автор | ID |
|---|---|---|---|
| `corridor.mp3` | High school hallway ambience | [SEF7](https://freesound.org/people/SEF7/) | [706989](https://freesound.org/s/706989/) |
| `corridor-busy.mp3` | High_School_Germany_Indoor_Ambience_Before_Class | [alexschmidtmeister](https://freesound.org/people/alexschmidtmeister/) | [324992](https://freesound.org/s/324992/) |
| `lecture.mp3` | Low Room Tone | [tvilgiat](https://freesound.org/people/tvilgiat/) | [472679](https://freesound.org/s/472679/) |
| `lecture-class.mp3` | Classroom Ambience — High School Class | [okieactor](https://freesound.org/people/okieactor/) | [417041](https://freesound.org/s/417041/) |
| `toilet.mp3` | AMBRoom-Int_Public Bathroom Ambience_HvD_OwSFX_Loop | [Hano_van_Dalen](https://freesound.org/people/Hano_van_Dalen/) | [767306](https://freesound.org/s/767306/) |
| `elevator-hall.mp3` | Old Soviet Blockhouse Elevator | [tonijsstrods](https://freesound.org/people/tonijsstrods/) | [841263](https://freesound.org/s/841263/) |

---

## Разовые звуки — `sfx/`

Тот же источник и та же лицензия: Freesound, **все CC0 1.0**.

| Файл | Оригинал | Автор | ID |
|---|---|---|---|
| `step-1.mp3`, `step-2.mp3`, `step-3.mp3` | Footsteps one person CLEAN | [RaggedyAngst](https://freesound.org/people/RaggedyAngst/) | [546270](https://freesound.org/s/546270/) |
| `coffee.mp3` | coffee machine large gurgle making coffee | [kyles](https://freesound.org/people/kyles/) | [451780](https://freesound.org/s/451780/) |
| `flush.mp3` | Toilet Flushing And Refilling | [mhtaylor67](https://freesound.org/people/mhtaylor67/) | [126046](https://freesound.org/s/126046/) |
| `tap.mp3` | Tap Water 1 | [OwlStorm](https://freesound.org/people/OwlStorm/) | [212177](https://freesound.org/s/212177/) |
| `elevator-doors.mp3` | university elevator door opening and closing | [MeanRaccoon](https://freesound.org/people/MeanRaccoon/) | [807238](https://freesound.org/s/807238/) |
| `elevator-ding.mp3` | Soft-Notifications — Bell — LowDing | [LegitCheese](https://freesound.org/people/LegitCheese/) | [571511](https://freesound.org/s/571511/) |
| `chair.mp3` | Squeaky Chair | [jashngooyen](https://freesound.org/people/jashngooyen/) | [556763](https://freesound.org/s/556763/) |
| `page.mp3` | turn_paper_sheet2 | [vibe_crc](https://freesound.org/people/vibe_crc/) | [59880](https://freesound.org/s/59880/) |
| `paper.mp3` | Paper Rustle | [BenjaminNelan](https://freesound.org/people/BenjaminNelan/) | [353125](https://freesound.org/s/353125/) |
| `pen.mp3` | Pen_writing_on_paper | [growlerr](https://freesound.org/people/growlerr/) | [333027](https://freesound.org/s/333027/) |

Звонок с пары, щелчок интерфейса, стук автомата, гонг перед выступлением
и оценка за него **файлами не лежат**: они синтезируются на Web Audio
в `src/render/audio/synth.ts`. Разведка (research/assets-audio.md, §2.1)
разделила это так: непрерывные слои и чистые тоны дешевле кодом, узнаваемые
предметные события — записью.

---

## Голоса — `voice/`

Восемь вокализов процедурного симлиша: два голоса (мужской и женский)
по четырём интонациям. **Синтезированы с нуля** для этого проекта
формантным синтезом (research/assets-audio.md, §1.5; исходник —
`assets-research/audio/proto-src/simlish.py`). Ни одной записи чужого
голоса, никаких лицензионных обязательств.
