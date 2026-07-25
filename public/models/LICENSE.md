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

Если каталог `characters/` присутствует, его содержимое взято отсюда:

- **Автор:** Quaternius (Tomás Laulhé) — https://quaternius.com
- **Наборы:** Ultimate Modular Men / Women, Universal Animation Library
- **Лицензия:** CC0 1.0 Universal
- **Оригинальные файлы лицензий:** `assets-research/characters/LICENSE.md`
- **Поддержать автора (по желанию):** https://www.patreon.com/quaternius

## Строка для титров

```
3D-модели: Kenney (kenney.nl) и Quaternius (quaternius.com). Лицензия CC0 1.0.
```

## Чего делать нельзя

CC0 снимает ограничения с моделей, но не даёт прав на бренд. Выдавать игру
за продукт Kenney или Quaternius, использовать их логотипы в оформлении
и маркетинге нельзя. Обзорные рендеры с логотипами лежат в `assets-research/`
как справочный материал команды и в сборку не попадают.
