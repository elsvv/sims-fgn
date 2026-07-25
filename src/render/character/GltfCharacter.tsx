import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AnimationMixer,
  Bone,
  Box3,
  BoxGeometry,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  Vector3,
  type AnimationAction,
  type AnimationClip,
  type BufferGeometry,
  type Group,
  type Material,
  type Object3D,
} from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { WALK_SPEED_MPS } from '../../sim/actor/Actor'
import type { CharacterAppearance } from '../../shared/appearance'
import {
  CHARACTER_ANIMATIONS_URL,
  characterModelUrls,
  IDLE_CLIP,
  modelUrl,
  PART_SLOTS,
  WALK_CLIP,
  type PartSlot,
} from '../../shared/characterModel'
import {
  colorForRole,
  girthScale,
  GLASSES_COLOR,
  glassesPlacement,
  heightScale,
  partSlotOf,
  rolesInSlot,
  walkTimeScale,
  type SlotMaterial,
} from './gltfAssembly'
import {
  animationStepSeconds,
  blendTowards,
  breathPhase,
  BREATH_BEND,
  BREATH_LIFT,
  type Posture,
} from './posture'
import { buildSeatedPose, type SeatedPose } from './seatedPose'

/**
 * Человек, собранный из моделей набора Quaternius.
 *
 * Принимает ровно то же, что и капсульный `ProceduralCharacter`, и на то
 * же место встаёт. Это не совпадение, а условие: описание внешности одно
 * на оба компонента, и любой из них можно подменить другим (см.
 * shared/appearance.ts). Кто из двоих рисуется, решает `Character`.
 *
 * Как собирается человек. Готовой модели ни одного из шестерых в наборе
 * нет — есть двадцать одна модель, разложенная на части (`*_Head`,
 * `*_Body`, `*_Legs`, `*_Feet`) на общем скелете из 62 костей. Марей —
 * это худи из одного файла, борода с гривой из второго и брюки из
 * третьего. Части переставляются, материалы перекрашиваются по внешности,
 * очки дорисовываются примитивом.
 *
 * Единственная неочевидная деталь всей сборки — пересадка. Индексы
 * суставов донорского меша ссылаются на ЕГО порядок костей, а не на
 * порядок костей базы. Поэтому скелет для донора пересобирается в его
 * собственном порядке из костей базы: наивная привязка к скелету базы
 * рвёт меш в лапшу.
 *
 * Поз три: стоит, идёт, сидит. Первые две — клипы набора (`Idle`, `Walk`)
 * с кроссфейдом между ними. Третьей в наборе нет и взять её негде (см.
 * seatedPose.ts), поэтому она считается по костям и подмешивается поверх
 * клипа по весу: пока вес идёт от нуля к единице, человек садится, пока
 * от единицы к нулю — встаёт. У полностью севшего проигрыватель не
 * работает вовсе: поза статическая, живость даёт дыхание.
 */

/** Длительность перехода между стоянием и ходьбой, в секундах. */
const FADE_SECONDS = 0.18

/** Оружие, которое в наборе лежит прямо в сцене персонажа. */
const WEAPON_NAMES = /^(Pistol|Sword)$/

interface CharacterBuild {
  root: Group
  mixer: AnimationMixer
  /** Кости фигуры по именам. Нужны позе сидения: её никакой клип не задаёт. */
  bones: Map<string, Bone>
  /**
   * Клипы, а не готовые действия.
   *
   * Действие живёт в кэше проигрывателя и умирает вместе с ним: снятие
   * фигуры с проигрывателя (`uncacheRoot`) обнуляет привязки всех уже
   * созданных действий. React в отладочном режиме нарочно монтирует
   * компонент дважды — с размонтированием посередине, — и сохранённое
   * действие после этого приводило к падению на `play()`. Действие
   * запрашивается заново каждый раз: для одного клипа проигрыватель
   * отдаёт то же самое, так что переход между стоянием и ходьбой
   * от этого не рвётся.
   */
  idle: AnimationClip | null
  walk: AnimationClip | null
  /** Во сколько раз фигура ужата или растянута по высоте. */
  scale: number
  /** Высота корня фигуры в файле. От неё отсчитывается посадка на стул. */
  baseY: number
  dispose: () => void
}

/** Узлы одной части тела. Кости не в счёт: кость `Head` тоже кончается на `Head`. */
function slotNodes(root: Object3D, slot: PartSlot): Object3D[] {
  const found: Object3D[] = []
  root.traverse((object) => {
    if (object instanceof Bone) return
    if (partSlotOf(object.name) === slot) found.push(object)
  })
  return found
}

/** Все кости фигуры по именам. Имена одинаковы во всех файлах набора. */
function bonesOf(root: Object3D): Map<string, Bone> {
  const bones = new Map<string, Bone>()
  root.traverse((object) => {
    if (object instanceof Bone) bones.set(object.name, object)
  })
  return bones
}

/**
 * Сажает донорскую часть на скелет базы.
 *
 * Порядок костей берётся донорский — по нему построены индексы суставов
 * в геометрии, — а сами кости берутся из базы. Обратные матрицы привязки
 * остаются донорскими: у всех моделей набора одна поза привязки, поэтому
 * они совпадают, и брать чужие нельзя только из принципа.
 */
function rebindTo(part: Object3D, bones: Map<string, Bone>): void {
  part.traverse((object) => {
    if (!(object instanceof SkinnedMesh)) return
    const ordered = object.skeleton.bones.map((bone) => bones.get(bone.name) ?? bone)
    object.bind(new Skeleton(ordered, object.skeleton.boneInverses), object.bindMatrix)
  })
}

function triangleCount(geometry: BufferGeometry): number {
  const index = geometry.getIndex()
  if (index) return index.count / 3
  const position = geometry.getAttribute('position')
  return position ? position.count / 3 : 0
}

function materialsOf(mesh: Mesh): Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material]
}

/** Часть тела, к которой относится меш: он сам либо ближайший предок с именем части. */
function slotOfMesh(mesh: Object3D): PartSlot | null {
  let node: Object3D | null = mesh
  while (node) {
    const slot = partSlotOf(node.name)
    if (slot) return slot
    node = node.parent
  }
  return null
}

/**
 * Перекрашивает собранную фигуру по внешности.
 *
 * Материалы обязательно клонируются: загрузчик отдаёт один и тот же
 * материал всем, кто грузит тот же файл, и Павлов с Долгоруковым,
 * собранные на одном теле, перекрасили бы друг друга. Клоны кэшируются
 * по паре «исходный материал + цвет»: у одного человека `Skin` встречается
 * в четырёх частях, и делать четыре одинаковых материала незачем.
 */
function repaint(root: Object3D, appearance: CharacterAppearance): Material[] {
  const bySlot = new Map<PartSlot | null, Mesh[]>()
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const slot = slotOfMesh(object)
    const bucket = bySlot.get(slot)
    if (bucket) bucket.push(object)
    else bySlot.set(slot, [object])
  })

  const owned: Material[] = []
  const cache = new Map<string, Material>()

  for (const [slot, meshes] of bySlot) {
    const weights = new Map<string, number>()
    for (const mesh of meshes) {
      const triangles = triangleCount(mesh.geometry)
      for (const material of materialsOf(mesh)) {
        weights.set(material.name, (weights.get(material.name) ?? 0) + triangles)
      }
    }
    const tally: SlotMaterial[] = [...weights].map(([material, triangles]) => ({
      material,
      triangles,
    }))
    const roles = rolesInSlot(slot, tally, appearance.model.roles)

    for (const mesh of meshes) {
      const painted = materialsOf(mesh).map((material) => {
        const role = roles.get(material.name) ?? 'keep'
        const color = colorForRole(role, appearance)
        if (!color) return material
        const key = `${material.uuid}:${color}`
        const known = cache.get(key)
        if (known) return known
        const clone = material.clone()
        if (clone instanceof MeshStandardMaterial) clone.color.set(color)
        cache.set(key, clone)
        owned.push(clone)
        return clone
      })
      const single = painted[0]
      mesh.material = painted.length === 1 && single ? single : painted
    }
  }

  return owned
}

/** Коробка части тела в осях фигуры. Пусто, если части нет. */
function slotBox(root: Object3D, slot: PartSlot): Box3 | null {
  const box = new Box3()
  let found = false
  root.traverse((object) => {
    if (!(object instanceof Mesh) || slotOfMesh(object) !== slot) return
    box.expandByObject(object)
    found = true
  })
  return found ? box : null
}

/**
 * Очки примитивом на кости `Head`.
 *
 * В наборе очков нет ни у одной из двадцати одной модели — проверено
 * по всем головам (research/assets-characters.md, §7.1). А Павлова без
 * очков не отличить от любого другого мужчины в футболке.
 *
 * Оправа цепляется к кости, а не к фигуре: тогда она едет вместе с
 * головой во всех анимациях — при кивке, при ходьбе, в разговоре, —
 * и не отстаёт от лица ни на кадр. Переносится через `attach`, который
 * сохраняет мировое положение: считать положение в осях кости вручную
 * не нужно, а поворот кости неизвестен и в разных наборах разный.
 */
function addGlasses(root: Object3D, bones: Map<string, Bone>): Mesh | null {
  const head = slotBox(root, 'Head')
  const bone = bones.get('Head')
  if (!head || !bone) return null

  const anchor = bone.getWorldPosition(new Vector3())
  const place = glassesPlacement(anchor, head.max.x - head.min.x)
  const frame = new Mesh(
    new BoxGeometry(place.size.x, place.size.y, place.size.z),
    new MeshStandardMaterial({ color: GLASSES_COLOR, roughness: 0.4, metalness: 0.3 }),
  )
  frame.name = 'Glasses'
  frame.position.set(place.position.x, place.position.y, place.position.z)
  root.add(frame)
  root.updateMatrixWorld(true)
  bone.attach(frame)
  return frame
}

/** То немногое, что сборке нужно от загруженного файла. */
interface LoadedModel {
  scene: Group
  animations: AnimationClip[]
}

/**
 * Собранный человек: тело, пересаженные части, цвета, очки, рост и анимации.
 *
 * Отсутствие файла — это исключение, а не тихая заглушка: его ловит
 * `ModelErrorBoundary` вокруг компонента и рисует капсульного человечка.
 * Молча собрать половину человека было бы хуже: на этаже стояла бы
 * фигура без головы, и никто бы не понял почему.
 */
function buildCharacter(
  loaded: readonly (LoadedModel | undefined)[],
  urls: readonly string[],
  appearance: CharacterAppearance,
): CharacterBuild {
  const byUrl = new Map(urls.map((url, index) => [url, loaded[index]]))
  const baseUrl = modelUrl(appearance.model.base)
  const base = byUrl.get(baseUrl)
  if (!base) throw new Error(`Модель персонажа не загрузилась: ${baseUrl}`)
  const root = cloneSkinned(base.scene) as Group
  const bones = bonesOf(root)

  for (const slot of PART_SLOTS) {
    const ref = appearance.model.parts?.[slot]
    if (!ref) continue
    const donor = byUrl.get(modelUrl(ref))
    if (!donor) continue
    const replaced = slotNodes(root, slot)
    const parent = replaced[0]?.parent ?? root
    for (const node of replaced) node.parent?.remove(node)
    for (const node of slotNodes(cloneSkinned(donor.scene), slot)) {
      rebindTo(node, bones)
      parent.add(node)
    }
  }

  // Оружие вырезано ещё при пересборке файлов (tools/build-character-models.mjs),
  // но пистолет в руке преподавателя — не та ошибка, которую стоит
  // ловить один раз. Проверка стоит и здесь: она стоит двух строк.
  const armed: Object3D[] = []
  root.traverse((object) => {
    if (WEAPON_NAMES.test(object.name)) armed.push(object)
  })
  for (const weapon of armed) weapon.parent?.remove(weapon)

  root.updateMatrixWorld(true)
  const owned = repaint(root, appearance)
  const glasses = appearance.glasses ? addGlasses(root, bones) : null

  root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    object.castShadow = true
    object.receiveShadow = true
    /*
     * Отсечение по пирамиде видимости выключено намеренно. Габарит
     * скиннингового меша считается по позе привязки и на ходу не
     * пересчитывается: персонаж, шагнувший к краю экрана, пропадал бы
     * целиком. Людей на этаже семеро, лишние отрисовки того стоят.
     */
    object.frustumCulled = false
  })

  root.updateMatrixWorld(true)
  const measured = new Box3().setFromObject(root).max.y
  const scale = heightScale(measured, appearance.height)
  const girth = girthScale(appearance.build)
  root.scale.set(scale * girth, scale, scale * girth)

  const clips = byUrl.get(CHARACTER_ANIMATIONS_URL)?.animations ?? []
  const mixer = new AnimationMixer(root)
  const clipNamed = (name: string): AnimationClip | null =>
    clips.find((candidate) => candidate.name === name) ?? null

  return {
    root,
    mixer,
    bones,
    scale,
    baseY: root.position.y,
    idle: clipNamed(IDLE_CLIP),
    walk: clipNamed(WALK_CLIP),
    dispose: () => {
      mixer.stopAllAction()
      mixer.uncacheRoot(root)
      for (const material of owned) material.dispose()
      if (glasses) {
        glasses.geometry.dispose()
        const material = glasses.material
        if (!Array.isArray(material)) material.dispose()
      }
    },
  }
}

/** Черновики, чтобы не создавать объектов three в каждом кадре. */
const scratchPosition = new Vector3()
const scratchTurn = new Quaternion()

export function GltfCharacter({
  appearance,
  posture,
  seatHeight,
}: {
  appearance: CharacterAppearance
  posture: Posture
  /** Высота сиденья под человеком в метрах или null, если он не на стуле. */
  seatHeight: number | null
}) {
  const urls = useMemo(() => characterModelUrls(appearance.model), [appearance.model])
  const loaded = useGLTF(urls)

  const built = useMemo(
    () => buildCharacter(loaded, urls, appearance),
    [loaded, urls, appearance],
  )

  const walking = posture === 'walk'

  /*
   * Сдвиг фазы. Шесть человек, запущенных одним клипом в один и тот же
   * момент, дышат и переступают синхронно — этаж превращается в
   * кордебалет. Сдвиг постоянен для человека и случаен между людьми.
   */
  const phase = useRef(Math.random())

  /**
   * Поза сидения считается по костям — и потому считается один раз,
   * когда человек в первый раз садится, а не при сборке фигуры: садятся
   * далеко не все, а стоящему эта работа не нужна. Пересчитывается,
   * только если человек пересел на сиденье другой высоты.
   */
  const seated = useRef<{ height: number; pose: SeatedPose | null } | null>(null)
  /** Насколько человек уже сел: 0 — стоит, 1 — сидит. */
  const sitting = useRef(0)
  /** Время, накопленное с прошлого пересчёта анимации у дальних людей. */
  const pending = useRef(0)

  useEffect(() => {
    seated.current = null
    sitting.current = 0
    pending.current = 0
    return () => built.dispose()
  }, [built])

  useEffect(() => {
    const clip = walking ? built.walk : built.idle
    if (!clip) return
    const action: AnimationAction = built.mixer.clipAction(clip)
    action.reset()
    action.timeScale = walking ? walkTimeScale(WALK_SPEED_MPS, built.scale) : 1
    action.time = phase.current * clip.duration
    action.fadeIn(FADE_SECONDS).play()
    return () => {
      action.fadeOut(FADE_SECONDS)
    }
  }, [walking, built])

  useFrame((state, delta) => {
    const root = built.root
    const wanted = posture === 'sit' && seatHeight !== null

    if (wanted && seated.current?.height !== seatHeight) {
      seated.current = {
        height: seatHeight,
        pose: buildSeatedPose({
          root,
          bones: built.bones,
          reference: built.idle,
          seatHeight,
          scale: built.scale,
        }),
      }
    }
    const pose = seated.current?.pose ?? null
    const weight = (sitting.current = blendTowards(
      sitting.current,
      wanted && pose ? 1 : 0,
      delta,
    ))

    /*
     * Сидящий не нуждается в проигрывателе вовсе: поза статическая,
     * а живость ему даёт дыхание. Это же и самая дешёвая экономия из
     * возможных — шестьдесят две кости, которые не надо интерполировать.
     */
    if (weight < 1) {
      pending.current += delta
      const step = animationStepSeconds(
        state.camera.position.distanceTo(root.getWorldPosition(scratchPosition)),
      )
      if (pending.current >= step) {
        built.mixer.update(pending.current)
        pending.current = 0
      }
    } else {
      pending.current = 0
    }

    if (!pose || weight === 0) {
      root.position.y = built.baseY
      return
    }

    for (const posed of pose.bones) posed.bone.quaternion.slerp(posed.quaternion, weight)
    for (const foot of pose.feet) {
      foot.bone.quaternion.slerp(foot.quaternion, weight)
      foot.bone.position.copy(foot.origin).lerp(foot.position, weight)
    }

    // Дыхание. Единственное движение сидящего — и потому единственное,
    // что отличает человека на стуле от манекена на стуле.
    const breath = breathPhase(state.clock.elapsedTime, phase.current) * weight
    if (pose.breath) {
      scratchTurn.setFromAxisAngle(pose.breath.axis, BREATH_BEND * breath)
      pose.breath.bone.quaternion.premultiply(scratchTurn)
    }
    root.position.y = built.baseY + BREATH_LIFT * breath - pose.drop * weight
  })

  /*
   * dispose={null}: геометрия и исходные материалы принадлежат кэшу
   * загрузчика и переиспользуются другими людьми на этаже. Освобождает
   * их только тот, кто их создал, — то есть никто, пока страница жива.
   * Своё же освобождается вручную, выше.
   */
  return <primitive object={built.root} dispose={null} />
}
