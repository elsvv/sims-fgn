# Лицензии на 3D-модели, попавшие в сборку игры

Здесь лежат только те модели, которые игра действительно грузит. Полные
наборы, из которых они взяты, вместе с оригинальными файлами лицензий
хранятся в `assets-research/` и в сборку не попадают.

Всё содержимое этого каталога — **CC0 1.0 Universal (Public Domain
Dedication)**. Авторы отказались от прав: коммерческое использование
разрешено, производные работы не обязаны оставаться под CC0, указание
авторства **не обязательно**. Мы указываем добровольно — авторы просят,
и это стоит одной строки.

- Текст лицензии: https://creativecommons.org/publicdomain/zero/1.0/
- Юридический текст: https://creativecommons.org/publicdomain/zero/1.0/legalcode

---

## Обстановка — `props/`

- **Автор:** Kenney (Kenney Vleugels) — https://kenney.nl
- **Набор:** Furniture Kit 2.0 — https://kenney.nl/assets/furniture-kit
- **Лицензия:** CC0 1.0 Universal
- **Оригинальный файл лицензии от автора:**
  `assets-research/props/kenney-furniture-kit/License.txt`

Дословно из `License.txt`:

> License: (Creative Commons Zero, CC0)
> http://creativecommons.org/publicdomain/zero/1.0/
>
> This content is free to use in personal, educational and commercial projects.
> Support us by crediting Kenney or www.kenney.nl (this is not mandatory)

Взято девять файлов из ста сорока — ровно столько, сколько предметов
в каталоге `src/content/props/propCatalog.ts`. Соответствие «предмет —
файл» описано там же, в поле `model` каждого предмета, а обоснование
выбора — в `research/assets-props.md`.

| Файл | Чем стал в игре |
|---|---|
| `desk.glb` | парта |
| `paneling.glb` | доска в аудитории и доска объявлений |
| `kitchenFridgeSmall.glb` | пурифайер |
| `kitchenFridge.glb` | автомат с едой |
| `kitchenFridgeLarge.glb` | кофейный автомат |
| `bench.glb` | скамейка в коридоре |
| `toilet.glb` | туалет |
| `doorwayFront.glb` | двери лифта |
| `stairs.glb` | лестница |

Модели перекрашены в рантайме в цвета из каталога предметов и вписаны
в габариты клетки. CC0 это разрешает без всяких условий.

## Персонажи — `characters/`

- **Автор:** Quaternius (Tomás Laulhé) — https://quaternius.com
- **Набор:** Ultimate Modular Characters — Men / Women
  - https://quaternius.com/packs/ultimatemodularmen.html
  - https://quaternius.com/packs/ultimatemodularwomen.html
- **Лицензия:** CC0 1.0 Universal
- **Оригинальный файл лицензии от автора:**
  `assets-research/characters/quaternius-ultimate-modular/men/License.txt`
- **Полные сведения и SHA-256 всех исходных файлов:**
  `assets-research/characters/LICENSE.md`
- **Поддержать автора (по желанию):** https://www.patreon.com/quaternius

Дословно из `License.txt`:

> This work is licensed under CC0 1.0 Universal (CC0 1.0)
> Public Domain Dedication
> http://creativecommons.org/publicdomain/zero/1.0/

Взято восемь моделей из двадцати одной. Готовой модели ни одного из
шестерых преподавателей в наборе нет — каждый собирается перестановкой
частей на общем скелете, поэтому файлов больше, чем людей, и меньше,
чем было бы при модели на человека.

| Файл | Кем стал в игре |
|---|---|
| `men/Casual_2.glb` | Павлов и Долгоруков целиком; ноги Марею, голова игроку |
| `men/Casual_Hoodie.glb` | Марей — свитер |
| `men/Adventurer.glb` | игрок; борода и грива Марею |
| `men/Suit.glb` | Михайловский |
| `women/Suit.glb` | Алиева |
| `women/Casual.glb` | Кречетова; светлый боб Алиевой |
| `women/Formal.glb` | кудри Долгорукову (только голова) |
| `women/SciFi.glb` | убранные волосы Кречетовой (только голова) |
| `animations.glb` | стояние и ходьба для всех |

Файлы пересобраны из исходных `.gltf` скриптом
`tools/build-character-models.mjs`: перегнаны в `.glb`, анимации вырезаны
в один общий файл, у двух моделей оставлена только голова, из геометрии
выброшены неиспользуемые атрибуты, а из сцены — оружие (`Pistol`),
которое автор кладёт прямо в сцену персонажа. Было 24 МБ, стало 3,9 МБ.
CC0 разрешает любые изменения без всяких условий.

Библиотека анимаций **Universal Animation Library** того же автора скачана
в `assets-research/`, но в сборку не попала: её скелет отличается от
скелета моделей, и перенос клипов требует отдельной работы в Blender
(research/assets-characters.md, §7.3). Стояние и ходьба взяты из самих
моделей.

## Строка для титров

```
3D-модели: Kenney (kenney.nl) и Quaternius (quaternius.com). Лицензия CC0 1.0.
```

## Чего делать нельзя

CC0 снимает ограничения с моделей, но не даёт прав на бренд. Выдавать игру
за продукт Kenney или Quaternius, использовать их логотипы в оформлении
и маркетинге нельзя. Обзорные рендеры с логотипами лежат в `assets-research/`
как справочный материал команды и в сборку не попадают.
