/**
 * Готовит модели персонажей для сборки игры.
 *
 * Что делает и зачем. Исходники Quaternius лежат в assets-research/ как
 * .gltf с буферами, вшитыми в base64: 3 МБ на файл, из которых треть —
 * накладные расходы кодирования, а ещё треть — двадцать четыре
 * анимационных клипа, скопированные в каждый из двадцати одного файла.
 * Класть это в public/ нельзя, поэтому файлы пересобираются:
 *
 * 1. .gltf → .glb: base64 уходит, остаётся двоичный буфер.
 * 2. Анимации вырезаются из всех моделей и складываются в один общий
 *    animations.glb. Скелет у всех моделей набора один и тот же — 62 кости
 *    с одинаковыми именами, — а дорожки клипа адресуют кости по имени.
 *    Значит, один файл клипов проигрывается на любой модели.
 * 3. Оружие (Pistol, Sword) удаляется. Преподаватель с пистолетом — не то,
 *    что нужно игре, а в наборе оно лежит прямо в сцене персонажа.
 * 4. У моделей-доноров остаётся только та часть, ради которой они взяты:
 *    от women/Formal нужна одна голова, тело и ноги — лишние два мегабайта.
 * 5. Из геометрии выбрасываются развёртка uv и вершинный цвет: текстур
 *    в наборе нет ни одной, красится всё цветом материала. Веса скиннинга
 *    ужимаются с float32 до нормализованного uint8 — это стандартный приём
 *    (так делает gltfpack), ошибка 1/255 на глаз неразличима.
 *
 * Запуск: node tools/build-character-models.mjs
 * Требует распакованных ассетов в assets-research/ (каталог в .gitignore).
 * Результат — public/models/characters/, он в репозитории есть.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BufferAttribute } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

// Экспортёр и загрузчик three рассчитаны на браузер. В Node не хватает
// двух мелочей, обе — про чтение двоичных данных, и обе заменяются
// четырьмя строчками поверх штатных Blob и fetch.
if (typeof globalThis.ProgressEvent === 'undefined') {
  globalThis.ProgressEvent = class ProgressEvent {
    constructor(type, init = {}) {
      this.type = type
      this.lengthComputable = init.lengthComputable ?? false
      this.loaded = init.loaded ?? 0
      this.total = init.total ?? 0
    }
  }
}
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buffer) => {
        this.result = buffer
        if (this.onloadend) this.onloadend()
      })
    }
  }
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(ROOT, 'assets-research/characters/quaternius-ultimate-modular')
const TARGET = join(ROOT, 'public/models/characters')

/**
 * Что берём и ради чего.
 *
 * `keep` — список частей, которые остаются в файле. Пусто значит «всё».
 * Соответствие «преподаватель — файл» описано в src/content/people/appearances.ts;
 * здесь только техническая сторона: какие файлы нужны и что от них нужно.
 */
const MODELS = [
  { pack: 'men', name: 'Casual_2' }, //      Павлов, Долгоруков; ноги Марею, голова игроку
  { pack: 'men', name: 'Casual_Hoodie' }, // Марей
  { pack: 'men', name: 'Adventurer' }, //    игрок; голова Марею
  { pack: 'men', name: 'Suit' }, //          Михайловский
  { pack: 'women', name: 'Suit' }, //        Алиева
  { pack: 'women', name: 'Casual' }, //      Кречетова; голова Алиевой
  { pack: 'women', name: 'Formal', keep: ['Head'] }, // кудри Долгорукову
  { pack: 'women', name: 'SciFi', keep: ['Head'] }, //  убранные волосы Кречетовой
]

/** Клипы, которые игра действительно проигрывает. */
const CLIPS = ['Idle', 'Walk']

/** Откуда берётся общий файл анимаций. Скелет одинаковый, файл роли не играет. */
const CLIP_SOURCE = { pack: 'men', name: 'Casual_2' }

/** Оружие, которое лежит в сцене персонажа и в игре не нужно. */
const WEAPONS = /^(Pistol|Sword)$/

const loader = new GLTFLoader()
const exporter = new GLTFExporter()

function load(pack, name) {
  const path = join(SOURCE, pack, 'gltf', `${name}.gltf`)
  return new Promise((resolve, reject) =>
    loader.parse(readFileSync(path, 'utf8'), '', resolve, reject),
  )
}

function toGlb(scene, animations) {
  return new Promise((resolve, reject) =>
    exporter.parse(scene, resolve, reject, { binary: true, animations }),
  )
}

/** Узлы, попадающие под условие, вместе с поддеревом. */
function prune(root, matches) {
  const doomed = []
  root.traverse((object) => {
    if (!object.isBone && matches(object)) doomed.push(object)
  })
  for (const object of doomed) object.parent?.remove(object)
  return doomed.length
}

/** Часть тела, к которой относится узел: Head, Body, Legs, Feet. */
function slotOf(name) {
  const match = /_(Head|Body|Legs|Feet|Pants)$/.exec(name)
  return match ? match[1] : null
}

/** Сжимает геометрию: лишние атрибуты вон, веса скиннинга в uint8. */
function shrink(root) {
  const seen = new Set()
  root.traverse((object) => {
    const geometry = object.geometry
    if (!geometry || seen.has(geometry)) return
    seen.add(geometry)
    geometry.deleteAttribute('uv')
    geometry.deleteAttribute('uv1')
    geometry.deleteAttribute('color')
    const weights = geometry.getAttribute('skinWeight')
    if (weights && weights.array instanceof Float32Array) {
      const packed = new Uint8Array(weights.array.length)
      for (let i = 0; i < weights.array.length; i++) {
        packed[i] = Math.round(Math.min(1, Math.max(0, weights.array[i])) * 255)
      }
      geometry.setAttribute('skinWeight', new BufferAttribute(packed, 4, true))
    }
  })
}

let total = 0

for (const spec of MODELS) {
  const gltf = await load(spec.pack, spec.name)
  const scene = gltf.scene

  const weapons = prune(scene, (object) => WEAPONS.test(object.name))
  const dropped = spec.keep
    ? prune(scene, (object) => {
        const slot = slotOf(object.name)
        return slot !== null && !spec.keep.includes(slot)
      })
    : 0
  shrink(scene)

  const glb = await toGlb(scene, [])
  const path = join(TARGET, spec.pack, `${spec.name}.glb`)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, Buffer.from(glb))
  total += glb.byteLength
  const kept = spec.keep ? ` (только ${spec.keep.join(', ')}, вырезано частей: ${dropped})` : ''
  const armed = weapons ? `, оружия убрано: ${weapons}` : ''
  console.log(`${spec.pack}/${spec.name}.glb — ${Math.round(glb.byteLength / 1024)} КБ${kept}${armed}`)
}

/**
 * Выбрасывает дорожки, которые ничего не меняют.
 *
 * Экспортёр Blender пишет положение каждой кости в каждом кадре, хотя
 * в скелете двигается только корень: у остальных пятидесяти с лишним
 * костей дорожка положения — одно и то же число, повторённое сорок раз.
 * Дорожка удаляется, только если её постоянное значение совпадает
 * с положением кости в позе привязки: иначе её отсутствие сдвинуло бы кость.
 */
function dropIdleTracks(clip, bones) {
  const before = clip.tracks.length
  clip.tracks = clip.tracks.filter((track) => {
    const [name, property] = track.name.split('.')
    if (property !== 'position' && property !== 'scale') return true
    const size = property === 'position' ? 3 : 3
    const values = track.values
    for (let i = size; i < values.length; i++) {
      if (Math.abs(values[i] - values[i % size]) > 1e-6) return true
    }
    const bone = bones.get(name)
    if (!bone) return true
    const rest = property === 'position' ? bone.position : bone.scale
    return (
      Math.abs(values[0] - rest.x) > 1e-6 ||
      Math.abs(values[1] - rest.y) > 1e-6 ||
      Math.abs(values[2] - rest.z) > 1e-6
    )
  })
  return before - clip.tracks.length
}

// Общий файл анимаций: тот же скелет, но без единого меша. Клип адресует
// кости по имени, поэтому проигрывается на любой из моделей выше.
const source = await load(CLIP_SOURCE.pack, CLIP_SOURCE.name)
prune(source.scene, (object) => object.isMesh)
const bones = new Map()
source.scene.traverse((object) => {
  if (object.isBone) bones.set(object.name, object)
})
const clips = CLIPS.map((name) => {
  const clip = source.animations.find((candidate) => candidate.name === name)
  if (!clip) throw new Error(`В наборе нет клипа ${name}`)
  const removed = dropIdleTracks(clip, bones)
  console.log(`  клип ${name}: дорожек без движения выброшено ${removed}, осталось ${clip.tracks.length}`)
  return clip
})
const animationsGlb = await toGlb(source.scene, clips)
writeFileSync(join(TARGET, 'animations.glb'), Buffer.from(animationsGlb))
total += animationsGlb.byteLength
console.log(`animations.glb — ${Math.round(animationsGlb.byteLength / 1024)} КБ (${CLIPS.join(', ')})`)

console.log(`Всего ${Math.round(total / 1024)} КБ`)
