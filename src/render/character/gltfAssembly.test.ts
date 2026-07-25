import { describe, expect, it } from 'vitest'
import { createAppearance } from '../../shared/appearance'
import type { MaterialRole } from '../../shared/characterModel'
import {
  clothingRole,
  colorForRole,
  girthScale,
  glassesPlacement,
  heightScale,
  isSkinMaterial,
  MODEL_HEIGHT,
  partSlotOf,
  rolesInSlot,
  SHOE_COLOR,
  walkTimeScale,
  WALK_CLIP_SPEED_MPS,
  type SlotMaterial,
} from './gltfAssembly'

/**
 * Разбор моделей набора Quaternius.
 *
 * Числа в тестах — не выдумка: это настоящие имена материалов и настоящее
 * число треугольников из файлов, которые лежат в public/models/characters
 * (посчитано разбором .glb). Правило перекраски держится именно на них,
 * и придуманные значения проверяли бы придуманное правило.
 */

/** Материалы части тела, как они лежат в файле. */
function slot(...entries: [string, number][]): SlotMaterial[] {
  return entries.map(([material, triangles]) => ({ material, triangles }))
}

describe('разбор имён узлов', () => {
  it('часть тела читается из имени узла', () => {
    expect(partSlotOf('Casual2_Head')).toBe('Head')
    expect(partSlotOf('Suit_Body')).toBe('Body')
    expect(partSlotOf('Casual2_Legs')).toBe('Legs')
    expect(partSlotOf('Casual_Feet')).toBe('Feet')
  })

  it('опечатка автора в имени головы ничего не ломает', () => {
    // У women/Formal голова названа Formad_Head — так в файле.
    // Правило смотрит на суффикс, поэтому опечатка ему безразлична.
    expect(partSlotOf('Formad_Head')).toBe('Head')
  })

  it('штаны фермера — тоже ноги', () => {
    expect(partSlotOf('Farmer_Pants')).toBe('Pants')
  })

  it('узлы, которые не части тела, не считаются частями', () => {
    expect(partSlotOf('Backpack')).toBeNull()
    expect(partSlotOf('Pistol')).toBeNull()
    expect(partSlotOf('CharacterArmature')).toBeNull()
    // Кость тоже зовётся Head, и путать её с частью тела нельзя.
    expect(partSlotOf('Head')).toBeNull()
  })

  it('кожа опознаётся по имени материала', () => {
    expect(isSkinMaterial('Skin')).toBe(true)
    expect(isSkinMaterial('Skin_Darker')).toBe(true)
    expect(isSkinMaterial('Suit')).toBe(false)
    expect(isSkinMaterial('Hair')).toBe(false)
  })

  it('главный материал части становится тем, чем эта часть одета', () => {
    expect(clothingRole('Head')).toBe('hair')
    expect(clothingRole('Body')).toBe('top')
    expect(clothingRole('Legs')).toBe('bottom')
    expect(clothingRole('Pants')).toBe('bottom')
    expect(clothingRole('Feet')).toBe('shoes')
  })
})

describe('роли материалов внутри части тела', () => {
  it('футболка становится верхом, а руки остаются кожей', () => {
    // men/Casual_2, узел Casual2_Body.
    const roles = rolesInSlot('Body', slot(['Skin', 2064], ['LightBrown', 742]))
    expect(roles.get('Skin')).toBe('skin')
    expect(roles.get('LightBrown')).toBe('top')
  })

  it('кожа не участвует в споре за главный материал', () => {
    // Кожи на теле втрое больше, чем футболки: голые руки — самая большая
    // поверхность узла. Без изъятия кожи верхом стали бы руки.
    const roles = rolesInSlot('Body', slot(['Skin', 2064], ['LightBrown', 742]))
    expect(roles.get('Skin')).not.toBe('top')
  })

  it('у костюма перекрашивается пиджак, а рубашка и галстук остаются своими', () => {
    // men/Suit, узел Suit_Body. Это Михайловский: белый треугольник
    // рубашки на тёмном пиджаке — то, чем он отличается от Алиевой,
    // тоже сплошь тёмной.
    const roles = rolesInSlot(
      'Body',
      slot(['Skin', 1826], ['Tie', 16], ['Suit', 872], ['White', 202]),
    )
    expect(roles.get('Suit')).toBe('top')
    expect(roles.get('White')).toBe('keep')
    expect(roles.get('Tie')).toBe('keep')
  })

  it('на голове перекрашивается причёска, а брови и глаза остаются тёмными', () => {
    // women/Suit, узел Suit_Head — эта голова достаётся Алиевой.
    // Волосы у неё очень светлые, и заливка бровей цветом волос стёрла бы
    // с лица всё: у отчёта про неё сказано «светлый боб + тёмные брови».
    const roles = rolesInSlot(
      'Head',
      slot(['Skin', 334], ['Hair_Brown', 40], ['Brown', 24], ['Hair_Blond', 2128]),
    )
    expect(roles.get('Hair_Blond')).toBe('hair')
    expect(roles.get('Hair_Brown')).toBe('keep')
    expect(roles.get('Brown')).toBe('keep')
    expect(roles.get('Skin')).toBe('skin')
  })

  it('причёска опознаётся по площади, а не по имени', () => {
    // women/Formal, узел Formad_Head — кудри Долгорукова. Материал волос
    // назван Red, а Hair в имени нет вовсе. Правило по именам покрасило бы
    // ему копну в рыжий и оставило бы как есть.
    const roles = rolesInSlot('Head', slot(['Skin', 390], ['Brown', 64], ['Red', 2088]))
    expect(roles.get('Red')).toBe('hair')
    expect(roles.get('Brown')).toBe('keep')
  })

  it('точечное переопределение перебивает правило', () => {
    // women/SciFi, узел SciFi_Head — голова Кречетовой. Синяя накладка
    // от скафандра на 132 треугольника правилу не мешает и потому им
    // не трогается; красим её как волосы вручную.
    const roles = rolesInSlot(
      'Head',
      slot(['Skin', 358], ['Black', 32], ['Brown', 24], ['Hair_Black', 2036], ['Blue', 132]),
      { Blue: 'hair' },
    )
    expect(roles.get('Blue')).toBe('hair')
    expect(roles.get('Hair_Black')).toBe('hair')
  })

  it('переопределённый материал не отбирает роль у главного', () => {
    // men/Adventurer, узел Adventurer_Body — куртка игрока. Накладки
    // на плечах переопределены в верх; главным при этом должно остаться
    // полотнище, иначе куртка выйдет двухцветной.
    const roles = rolesInSlot(
      'Body',
      slot(['Skin', 2086], ['Green', 980], ['LightGreen', 462]),
      { LightGreen: 'top' },
    )
    expect(roles.get('Green')).toBe('top')
    expect(roles.get('LightGreen')).toBe('top')
  })

  it('единственный материал части — он же главный', () => {
    // men/Casual_2, узел Casual2_Legs: джинсы одним куском.
    expect(rolesInSlot('Legs', slot(['LightBlue', 734])).get('LightBlue')).toBe('bottom')
  })

  it('обувь красится в свой цвет, а щиколотки остаются кожей', () => {
    // women/Suit, узел Suit_Feet.
    const roles = rolesInSlot('Feet', slot(['Skin', 114], ['Black', 408]))
    expect(roles.get('Black')).toBe('shoes')
    expect(roles.get('Skin')).toBe('skin')
  })

  it('то, что не часть тела, не красится вовсе', () => {
    // Рюкзак игрока — не одежда, и заливать его цветом куртки нечего.
    const roles = rolesInSlot(
      null,
      slot(['Brown', 320], ['LightGreen', 966], ['Gold', 400], ['Green', 66]),
      { LightGreen: 'top' },
    )
    for (const role of roles.values()) expect(role).toBe('keep')
  })

  it('часть без материалов не роняет разбор', () => {
    expect(rolesInSlot('Body', []).size).toBe(0)
  })
})

describe('цвет по роли', () => {
  const look = createAppearance({
    skin: '#e0b189',
    hair: '#241c16',
    top: '#2f6fae',
    bottom: '#2b3340',
  })

  it('каждая роль берёт свой цвет из внешности', () => {
    expect(colorForRole('skin', look)).toBe(look.skin)
    expect(colorForRole('hair', look)).toBe(look.hair)
    expect(colorForRole('top', look)).toBe(look.top)
    expect(colorForRole('bottom', look)).toBe(look.bottom)
    expect(colorForRole('shoes', look)).toBe(SHOE_COLOR)
  })

  it('«оставить как есть» не даёт цвета вовсе', () => {
    // Это и есть способ сохранить глаза, брови и галстук: внешность
    // про них ничего не знает, и придумывать за неё нечего.
    expect(colorForRole('keep', look)).toBeNull()
  })

  it('роли покрыты все до одной', () => {
    const roles: MaterialRole[] = ['skin', 'hair', 'top', 'bottom', 'shoes', 'keep']
    for (const role of roles) {
      expect(() => colorForRole(role, look)).not.toThrow()
    }
  })
})

describe('рост и сложение', () => {
  it('фигура ужимается до заявленного роста', () => {
    expect(heightScale(MODEL_HEIGHT, 1.63)).toBeCloseTo(1.63 / MODEL_HEIGHT, 10)
    expect(MODEL_HEIGHT * heightScale(MODEL_HEIGHT, 1.83)).toBeCloseTo(1.83, 10)
  })

  it('измерять можно любую фигуру, лишь бы она была человеком', () => {
    // Донорская голова выше базовой, и рост собранной фигуры отличается
    // от роста набора. Масштаб считается по измеренному, а не по среднему.
    expect(1.9 * heightScale(1.9, 1.7)).toBeCloseTo(1.7, 10)
  })

  it('бессмысленное измерение не превращает человека в точку', () => {
    // Пустой файл даёт вывернутый габарит: max.y уходит в минус
    // бесконечность. Масштаб от такого числа — либо ноль, либо NaN,
    // и вместо человека на этаже ничего.
    for (const broken of [0, -Infinity, Infinity, Number.NaN, 12]) {
      const scale = heightScale(broken, 1.75)
      expect(scale, `${broken}`).toBeCloseTo(1.75 / MODEL_HEIGHT, 10)
    }
  })

  it('плотный шире худого, но не вдвое', () => {
    expect(girthScale(0.92)).toBeGreaterThan(girthScale(0.15))
    expect(girthScale(1) / girthScale(0)).toBeLessThan(1.2)
  })

  it('сложение вне шкалы не растягивает фигуру в блин', () => {
    expect(girthScale(-5)).toBe(girthScale(0))
    expect(girthScale(5)).toBe(girthScale(1))
  })
})

describe('ходьба', () => {
  it('фигура в натуральную величину идёт клипом как есть', () => {
    expect(walkTimeScale(WALK_CLIP_SPEED_MPS, 1)).toBeCloseTo(1, 10)
  })

  it('невысокий переступает чаще: шаг короче, а скорость та же', () => {
    const short = walkTimeScale(1.4, 1.63 / MODEL_HEIGHT)
    const tall = walkTimeScale(1.4, 1.83 / MODEL_HEIGHT)
    expect(short).toBeGreaterThan(tall)
    expect(short).toBeLessThan(1.5)
  })

  it('нулевой масштаб не даёт делить на ноль', () => {
    expect(walkTimeScale(1.4, 0)).toBe(1)
  })
})

describe('очки', () => {
  // Кость Head у всех моделей набора стоит в одном месте — это один и тот
  // же скелет. Числа взяты из файлов: мужская голова и женская.
  const MALE_HEAD_BONE = { x: 0.004, y: 1.547, z: 0.094 }
  const FEMALE_HEAD_BONE = { x: -0.014, y: 1.548, z: 0.088 }

  it('оправа приходится на глаза, а не на брови', () => {
    // Глаза в файле men/Casual_2 занимают по высоте 1.636..1.662,
    // брови — 1.652..1.666. Промах вверх на полтора сантиметра
    // превращает очки в повязку на лбу; так и было в первом подборе.
    const place = glassesPlacement(MALE_HEAD_BONE, 0.225)
    const top = place.position.y + place.size.y / 2
    const bottom = place.position.y - place.size.y / 2
    expect(bottom).toBeLessThanOrEqual(1.636)
    expect(top).toBeGreaterThanOrEqual(1.662)
  })

  it('оправа лежит на лице, а не висит перед носом', () => {
    // Лицо в том же файле кончается на z = 0.230, глаза — на 0.188..0.217.
    const place = glassesPlacement(MALE_HEAD_BONE, 0.225)
    const front = place.position.z + place.size.z / 2
    const back = place.position.z - place.size.z / 2
    expect(front).toBeLessThanOrEqual(0.23)
    expect(back).toBeLessThanOrEqual(0.217)
  })

  it('на женской голове очки садятся так же', () => {
    const place = glassesPlacement(FEMALE_HEAD_BONE, 0.234)
    expect(place.position.y).toBeCloseTo(1.649, 2)
    expect(place.position.z).toBeCloseTo(0.209, 2)
  })

  it('оправа уже головы: она садится на лицо, а не торчит за уши', () => {
    for (const width of [0.225, 0.234, 0.241]) {
      expect(glassesPlacement(MALE_HEAD_BONE, width).size.x).toBeLessThan(width)
    }
  })

  it('оправа посередине лица', () => {
    expect(glassesPlacement(MALE_HEAD_BONE, 0.225).position.x).toBeCloseTo(0.004, 10)
    expect(glassesPlacement(FEMALE_HEAD_BONE, 0.234).position.x).toBeCloseTo(-0.014, 10)
  })
})
