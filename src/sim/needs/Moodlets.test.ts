import { describe, expect, it } from 'vitest'
import { MoodletList, moodletFrom, type Moodlet, type MoodletSpec } from './Moodlets'

const COFFEE: MoodletSpec = {
  id: 'coffee',
  label: 'Кофе из автомата',
  mood: 14,
  durationMinutes: 120,
}

const ELEVATOR: MoodletSpec = {
  id: 'elevator',
  label: 'Ждал лифт восемь минут',
  mood: -12,
  durationMinutes: 60,
}

function at(spec: MoodletSpec, minute: number): Moodlet {
  return moodletFrom(spec, minute)
}

describe('заготовка модификатора', () => {
  it('отсчитывает срок от текущей минуты', () => {
    expect(at(COFFEE, 400)).toEqual({
      id: 'coffee',
      label: 'Кофе из автомата',
      mood: 14,
      expiresAtMinute: 520,
    })
  })
})

describe('список модификаторов', () => {
  it('пустой список не двигает настроение', () => {
    const list = new MoodletList()
    expect(list.totalMood(0)).toBe(0)
    expect(list.active(0)).toEqual([])
  })

  it('складывает сдвиги активных модификаторов', () => {
    const list = new MoodletList()
    list.add(at(COFFEE, 0))
    list.add(at(ELEVATOR, 0))
    expect(list.totalMood(10)).toBe(2)
  })

  it('отрицательный сдвиг уводит сумму в минус', () => {
    const list = new MoodletList()
    list.add(at(ELEVATOR, 0))
    expect(list.totalMood(10)).toBe(-12)
  })

  it('просроченные не учитываются в сумме', () => {
    const list = new MoodletList()
    list.add(at(COFFEE, 0))
    list.add(at(ELEVATOR, 0))
    expect(list.totalMood(90)).toBe(14)
    expect(list.totalMood(200)).toBe(0)
  })

  it('модификатор действует ровно до своей минуты и ни минутой дольше', () => {
    const list = new MoodletList()
    list.add(at(ELEVATOR, 0))
    expect(list.totalMood(59.9)).toBe(-12)
    expect(list.totalMood(60)).toBe(0)
  })

  it('active отдаёт только действующие', () => {
    const list = new MoodletList()
    list.add(at(COFFEE, 0))
    list.add(at(ELEVATOR, 0))
    expect(list.active(90).map((m) => m.id)).toEqual(['coffee'])
  })

  it('active отдаёт копии — вернувший их код не может испортить состояние', () => {
    const list = new MoodletList()
    list.add(at(COFFEE, 0))
    const [first] = list.active(0)
    first!.mood = 1000
    expect(list.totalMood(0)).toBe(14)
  })

  it('повторное добавление не плодит дубли', () => {
    const list = new MoodletList()
    list.add(at(COFFEE, 0))
    list.add(at(COFFEE, 30))
    expect(list.size).toBe(1)
    expect(list.totalMood(30)).toBe(14)
  })

  it('повторное добавление продлевает срок', () => {
    const list = new MoodletList()
    list.add(at(COFFEE, 0))
    expect(list.totalMood(130)).toBe(0)

    list.add(at(COFFEE, 100))
    expect(list.totalMood(130)).toBe(14)
    expect(list.totalMood(220)).toBe(0)
  })

  it('повторное добавление не укорачивает уже идущий эффект', () => {
    const list = new MoodletList()
    list.add(at(COFFEE, 0))
    list.add({ ...at(COFFEE, 0), expiresAtMinute: 10 })
    expect(list.totalMood(60)).toBe(14)
  })

  it('повторное добавление обновляет текст и величину', () => {
    const list = new MoodletList()
    list.add(at(COFFEE, 0))
    list.add({ id: 'coffee', label: 'Третий кофе за утро', mood: -5, expiresAtMinute: 200 })
    const [only] = list.active(10)
    expect(only?.label).toBe('Третий кофе за утро')
    expect(only?.mood).toBe(-5)
  })

  it('prune убирает просроченные', () => {
    const list = new MoodletList()
    list.add(at(COFFEE, 0))
    list.add(at(ELEVATOR, 0))
    list.prune(90)
    expect(list.size).toBe(1)
    expect(list.has('elevator')).toBe(false)
    expect(list.has('coffee')).toBe(true)
  })

  it('prune не трогает действующие', () => {
    const list = new MoodletList()
    list.add(at(COFFEE, 0))
    list.prune(0)
    expect(list.has('coffee')).toBe(true)
  })

  it('has отвечает про хранилище', () => {
    const list = new MoodletList()
    expect(list.has('coffee')).toBe(false)
    list.add(at(COFFEE, 0))
    expect(list.has('coffee')).toBe(true)
  })

  it('remove убирает запись досрочно', () => {
    const list = new MoodletList()
    list.add(at(COFFEE, 0))
    list.remove('coffee')
    expect(list.has('coffee')).toBe(false)
    expect(list.totalMood(0)).toBe(0)
  })

  it('clear очищает всё', () => {
    const list = new MoodletList()
    list.add(at(COFFEE, 0))
    list.add(at(ELEVATOR, 0))
    list.clear()
    expect(list.size).toBe(0)
  })

  it('переживает сохранение и загрузку', () => {
    const list = new MoodletList()
    list.add(at(COFFEE, 0))
    list.add(at(ELEVATOR, 0))

    const restored = MoodletList.fromJSON(JSON.parse(JSON.stringify(list.toJSON())) as Moodlet[])
    expect(restored.totalMood(10)).toBe(2)
    expect(restored.active(10).map((m) => m.label)).toEqual([
      'Кофе из автомата',
      'Ждал лифт восемь минут',
    ])
  })

  it('снимок не связан с живым списком', () => {
    const list = new MoodletList()
    list.add(at(COFFEE, 0))
    const snapshot = list.toJSON()
    list.add(at(ELEVATOR, 0))
    expect(snapshot.length).toBe(1)
  })

  it('загруженный список не связан с исходными данными', () => {
    const data = [at(COFFEE, 0)]
    const restored = MoodletList.fromJSON(data)
    restored.add(at(ELEVATOR, 0))
    expect(data.length).toBe(1)
  })
})
