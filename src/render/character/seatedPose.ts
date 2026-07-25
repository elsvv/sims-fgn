import {
  Bone,
  Matrix4,
  Quaternion,
  Vector3,
  type AnimationClip,
  type Object3D,
} from 'three'
import {
  SEATED_FOREARM,
  SEATED_LEAN,
  SEATED_UPPER_ARM,
  seatedDrop,
  seatedLegAngles,
} from './posture'

/**
 * Поза сидения, посчитанная по скелету модели.
 *
 * ЗАЧЕМ ЭТО СУЩЕСТВУЕТ. Готового клипа сидения у набора нет, а клип
 * из библиотеки анимаций того же автора не подходит: скелеты разные
 * (`Hips` против `pelvis`, `UpperLegL` против `thigh_l`), общее имя
 * во всех шестидесяти с лишним костях ровно одно — `Head`. Дорожка
 * анимации ищет кость по имени и не находит ничего. Поэтому поза
 * не берётся, а считается — прямо по костям настоящего скелета.
 *
 * КАК СЧИТАЕТСЯ. Повороты задаются в осях фигуры («бедро вперёд
 * на 80 градусов»), а не в осях кости. Так надо: у каждой кости своя
 * ориентация покоя, и «повернуть вокруг своего X» для бедра, плеча
 * и позвонка значит три разные вещи. Поэтому для каждой кости
 * считается, какой поворот относительно родителя даёт нужный поворот
 * в осях фигуры, — и в кость кладётся уже он.
 *
 * Кости берутся из позы отсчёта — первого кадра клипа стояния, а не
 * из позы файла: в позе файла у моделей набора скелет стоит криво
 * (ноги врозь, корпус довёрнут), потому что настоящая поза приходит
 * из анимации. Считать сидение от кривой позы значило бы криво и сажать.
 */

/** Кость, которой поза задаёт поворот. */
export interface PosedBone {
  bone: Bone
  quaternion: Quaternion
}

/**
 * Ступня.
 *
 * У этого скелета ступни висят не на голени, а прямо на корне: так
 * устроен риг с обратной кинематикой, где ступня — цель, а не звено.
 * Значит, согнутая нога их за собой не потянет, и место ступни
 * приходится считать отдельно — иначе сидящий остаётся стоять ботинками
 * там же, где стоял.
 */
export interface PosedFoot extends PosedBone {
  /** Куда ступня встаёт у сидящего, в системе своего родителя. */
  position: Vector3
  /**
   * Где она стоит у стоящего.
   *
   * Хранится, потому что вернуть её обратно больше некому: клип стояния
   * двигает кости поворотом, а положение ступни не трогает вовсе. Не
   * запомнив исходное, встать было бы уже нельзя — ботинки остались бы
   * там, где их поставило сидение.
   */
  origin: Vector3
}

/** Чем дышит сидящий: кость и ось её покачивания в системе родителя. */
export interface BreathJoint {
  bone: Bone
  axis: Vector3
}

export interface SeatedPose {
  bones: PosedBone[]
  feet: PosedFoot[]
  /** На сколько метров опустить фигуру. */
  drop: number
  breath: BreathJoint | null
}

/** Кости, которым поза задаёт поворот, — родители раньше детей. */
const LEAN_BONES = ['Abdomen'] as const
const ARM_BONES = ['UpperArmL', 'UpperArmR', 'LowerArmL', 'LowerArmR'] as const
const LEG_BONES = ['UpperLegL', 'UpperLegR', 'LowerLegL', 'LowerLegR'] as const
/** Ступня и голень, с которой она обязана уехать вместе. */
const FEET = [
  { foot: 'FootL', shin: 'LowerLegL' },
  { foot: 'FootR', shin: 'LowerLegR' },
] as const
const FOOT_BONES = FEET.map((pair) => pair.foot)
/** Кость, которую качает дыхание. Грудь, а не голова: дышат корпусом. */
const BREATH_BONE = 'Torso'

/** Ось «вперёд-назад» в осях фигуры: модель смотрит вдоль +Z, значит сгиб идёт вокруг X. */
const PITCH_AXIS = new Vector3(1, 0, 0)

/**
 * Ставит скелет в первый кадр клипа.
 *
 * Проигрыватель для этого не нужен и вреден: он приписан к фигуре,
 * держит своё состояние и, будучи запущенным ради одного кадра, оставил
 * бы после себя действие, которое потом придётся гасить. Дорожка клипа —
 * это просто числа, и первый кадр читается из неё напрямую.
 */
function applyFirstFrame(bones: Map<string, Bone>, clip: AnimationClip): void {
  for (const track of clip.tracks) {
    const dot = track.name.lastIndexOf('.')
    if (dot < 0) continue
    const bone = bones.get(track.name.slice(0, dot))
    if (!bone) continue
    const values = track.values
    switch (track.name.slice(dot + 1)) {
      case 'quaternion':
        bone.quaternion.set(values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 1)
        break
      case 'position':
        bone.position.set(values[0] ?? 0, values[1] ?? 0, values[2] ?? 0)
        break
      case 'scale':
        bone.scale.set(values[0] ?? 1, values[1] ?? 1, values[2] ?? 1)
        break
    }
  }
}

/** Положение и поворот узла в системе координат фигуры, без её масштаба. */
function relativeTo(inverseRoot: Matrix4, node: Object3D): { matrix: Matrix4; position: Vector3; quaternion: Quaternion } {
  const matrix = new Matrix4().multiplyMatrices(inverseRoot, node.matrixWorld)
  const position = new Vector3()
  const quaternion = new Quaternion()
  matrix.decompose(position, quaternion, new Vector3())
  return { matrix, position, quaternion }
}

/**
 * Считает позу сидения на сиденье такой высоты.
 *
 * @param root корень фигуры; его масштаб уже выставлен по росту человека
 * @param bones кости фигуры по именам
 * @param reference клип стояния — из его первого кадра берётся поза отсчёта
 * @param seatHeight высота сиденья над полом, метры
 * @param scale во сколько раз фигура ужата относительно модели набора
 */
export function buildSeatedPose(options: {
  root: Object3D
  bones: Map<string, Bone>
  reference: AnimationClip | null
  seatHeight: number
  scale: number
}): SeatedPose | null {
  const { root, bones, reference, seatHeight, scale } = options
  if (scale <= 0) return null

  if (reference) applyFirstFrame(bones, reference)
  root.updateMatrixWorld(true)
  const inverseRoot = new Matrix4().copy(root.matrixWorld).invert()

  const measured = new Map<string, { position: Vector3; quaternion: Quaternion }>()
  for (const name of [...LEG_BONES, ...FOOT_BONES, ...ARM_BONES, ...LEAN_BONES]) {
    const bone = bones.get(name)
    if (bone) measured.set(name, relativeTo(inverseRoot, bone))
  }

  const hip = measured.get('UpperLegL')
  const knee = measured.get('LowerLegL')
  const ankle = measured.get('FootL')
  if (!hip || !knee || !ankle) return null

  // Длины костей меряются по фигуре и переводятся в метры её масштабом:
  // у Алиевой ростом 1.63 бедро короче, чем у Марея, и садятся они по-разному.
  const thighLength = knee.position.distanceTo(hip.position) * scale
  const shinLength = ankle.position.distanceTo(knee.position) * scale
  const standingHip = hip.position.y * scale
  const standingAnkle = ankle.position.y * scale

  const drop = seatedDrop(standingHip, seatHeight)
  const angles = seatedLegAngles({
    hip: standingHip - drop,
    ankle: standingAnkle,
    thigh: thighLength,
    shin: shinLength,
  })

  /** Повороты в осях фигуры: минус — вперёд, плюс — назад. */
  const turns = new Map<string, number>([
    ['Abdomen', SEATED_LEAN],
    ['UpperArmL', -SEATED_UPPER_ARM],
    ['UpperArmR', -SEATED_UPPER_ARM],
    ['LowerArmL', -SEATED_FOREARM],
    ['LowerArmR', -SEATED_FOREARM],
    ['UpperLegL', -angles.thigh],
    ['UpperLegR', -angles.thigh],
    ['LowerLegL', angles.shin],
    ['LowerLegR', angles.shin],
  ])

  const posed: PosedBone[] = []
  const delta = new Quaternion()

  // Порядок важен: поворот родителя меняет положение ребёнка, поэтому
  // корпус ставится раньше рук, бедро — раньше голени, а ступни считаются
  // последними, когда нога уже согнута.
  for (const name of [...LEAN_BONES, ...ARM_BONES, ...LEG_BONES]) {
    const turn = turns.get(name)
    const bone = bones.get(name)
    const rest = measured.get(name)
    if (turn === undefined || !bone || !rest) continue

    delta.setFromAxisAngle(PITCH_AXIS, turn)
    const desired = delta.clone().multiply(rest.quaternion)
    const parent = bone.parent
    const parentQuaternion = parent
      ? relativeTo(inverseRoot, parent).quaternion
      : new Quaternion()
    const local = parentQuaternion.invert().multiply(desired)

    bone.quaternion.copy(local)
    bone.updateMatrixWorld(true)
    posed.push({ bone, quaternion: local.clone() })
  }

  const feet: PosedFoot[] = []
  for (const pair of FEET) {
    const bone = bones.get(pair.foot)
    const rest = measured.get(pair.foot)
    const shinBone = bones.get(pair.shin)
    const shinRest = measured.get(pair.shin)
    const parent = bone?.parent
    if (!bone || !rest || !shinBone || !shinRest || !parent) continue

    // Где ступня стояла относительно голени — в системе самой голени.
    // Согнутая нога уносит её с собой ровно на то же место.
    const offset = rest.position
      .clone()
      .sub(shinRest.position)
      .applyQuaternion(shinRest.quaternion.clone().invert())

    const shinNow = relativeTo(inverseRoot, shinBone)
    const target = offset.clone().applyQuaternion(shinNow.quaternion).add(shinNow.position)

    const parentNow = relativeTo(inverseRoot, parent)
    const position = target.clone().applyMatrix4(parentNow.matrix.clone().invert())
    const quaternion = parentNow.quaternion.clone().invert().multiply(rest.quaternion)
    const origin = bone.position.clone()

    bone.position.copy(position)
    bone.quaternion.copy(quaternion)
    bone.updateMatrixWorld(true)
    feet.push({ bone, position, quaternion, origin })
  }

  const breathBone = bones.get(BREATH_BONE)
  const breathParent = breathBone?.parent
  const breath: BreathJoint | null =
    breathBone && breathParent
      ? {
          bone: breathBone,
          // Ось качания — та же «вперёд-назад» фигуры, пересчитанная
          // в систему родителя: только там её можно домножить к повороту.
          axis: PITCH_AXIS.clone().applyQuaternion(
            relativeTo(inverseRoot, breathParent).quaternion.invert(),
          ),
        }
      : null

  /*
   * Кость дыхания попадает в позу, даже если сама поза её не поворачивает.
   * Иначе накопится: сидящему проигрыватель не нужен и не запущен, кости
   * ему никто не переписывает, а дыхание домножается к повороту каждый
   * кадр — за минуту грудь провернуло бы на пол-оборота.
   */
  if (breathBone && !posed.some((item) => item.bone === breathBone)) {
    posed.push({ bone: breathBone, quaternion: breathBone.quaternion.clone() })
  }

  return { bones: posed, feet, drop, breath }
}
