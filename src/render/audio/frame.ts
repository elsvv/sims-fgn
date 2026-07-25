import type { ConsequenceChange } from '../../sim/dialogue/Consequences'
import type { Vec2 } from '../../sim/types'
import type {
  ActiveChainInfo,
  ActiveDialogueInfo,
  ActiveInteraction,
  WorldSnapshot,
} from '../../sim/World'
import type { AmbienceSituation } from './ambience'
import type { AudioFrame, AudioInteraction, AudioLine, LineTone } from './events'
import { isNight, type MusicSituation } from './music'

/**
 * Перевод снимка мира на язык звука.
 *
 * Симуляция сообщает, что происходит; здесь из этого вынимается ровно
 * то, от чего зависит звук, и ничего больше. Функции чистые: на входе
 * снимок и карта предметов, на выходе — данные. Ни микшера, ни React,
 * ни Web Audio.
 *
 * Разговоры разбираются здесь же, потому что «какая реплика сейчас
 * на экране» — это вопрос о состоянии мира, а не о звуке. Звук только
 * решает, чьим голосом её сказать.
 */

/** Где стоит какой предмет, в метрах мира. Считается один раз на этаж. */
export type PropPositions = ReadonlyMap<string, Vec2>

/**
 * Тон реплики по тому, чем она отозвалась в отношениях.
 *
 * Испорченное сильнее улучшенного: разговор, в котором уважение выросло,
 * а симпатия рухнула, звучит недовольством — так его и слышит собеседник.
 */
export function toneOfChanges(changes: readonly ConsequenceChange[]): LineTone {
  if (changes.some((change) => change.direction === 'down')) return 'cold'
  if (changes.some((change) => change.direction === 'up')) return 'warm'
  return 'plain'
}

/**
 * Реплика многошаговой сцены.
 *
 * Ключ собран из узла и того, что на экране: сначала показывают вопрос,
 * потом — реакцию на ответ. Это две разные реплики одного узла, и голос
 * должен прозвучать дважды, а не один раз на весь узел.
 */
function chainLine(chain: ActiveChainInfo): AudioLine | null {
  const node = chain.nodeId ?? 'конец'
  if (chain.outcome !== null) {
    return {
      key: `chain|${chain.chainId}|итог`,
      speakerId: chain.speakerId,
      text: chain.outcome.summary,
      tone: toneOfChanges(chain.outcome.changes),
    }
  }
  if (chain.awaitingContinue && chain.reply !== null) {
    return {
      key: `chain|${chain.chainId}|${node}|ответ`,
      speakerId: chain.speakerId,
      text: chain.reply,
      tone: chain.consequence === null ? 'plain' : toneOfChanges(chain.consequence.changes),
    }
  }
  if (chain.prompt !== null) {
    return {
      key: `chain|${chain.chainId}|${node}|реплика`,
      speakerId: chain.speakerId,
      text: chain.prompt,
      tone: 'plain',
    }
  }
  return null
}

function dialogueLine(dialogue: ActiveDialogueInfo): AudioLine {
  if (dialogue.reply !== null) {
    return {
      key: `разговор|${dialogue.nodeId}|ответ`,
      speakerId: dialogue.speakerId,
      text: dialogue.reply,
      tone: 'plain',
    }
  }
  return {
    key: `разговор|${dialogue.nodeId}|реплика`,
    speakerId: dialogue.speakerId,
    text: dialogue.prompt,
    tone: 'plain',
  }
}

/** Реплика, звучащая на экране прямо сейчас. */
export function lineOf(snapshot: WorldSnapshot): AudioLine | null {
  if (snapshot.activeChain !== null) return chainLine(snapshot.activeChain)
  if (snapshot.activeDialogue !== null) return dialogueLine(snapshot.activeDialogue)
  return null
}

/**
 * Действие с предметом.
 *
 * `working` отличает «идёт туда» от «делает»: между командой и делом
 * персонаж пересекает коридор, и смыв в начале пути звучал бы
 * пророчеством. Признаком служит то, что персонаж остановился, — дойдя
 * до предмета, он больше никуда не идёт.
 */
export function interactionOf(
  interaction: ActiveInteraction | null,
  moving: boolean,
  positions: PropPositions,
): AudioInteraction | null {
  if (interaction === null) return null
  const at = positions.get(interaction.propId)
  if (at === undefined) return null
  return {
    key: `${interaction.propId}|${interaction.interactionId}`,
    interactionId: interaction.interactionId,
    at,
    working: !moving,
  }
}

/** Состояние мира глазами звука. */
export function audioFrameOf(
  snapshot: WorldSnapshot,
  interaction: ActiveInteraction | null,
  positions: PropPositions,
): AudioFrame {
  const lesson = snapshot.currentLesson
  const speech = snapshot.seminar?.speech ?? null
  return {
    playerAt: snapshot.playerPosition,
    moving: snapshot.isPlayerMoving,
    lessonKey: lesson === null ? null : `${lesson.courseId}|${lesson.room}`,
    interaction: interactionOf(interaction, snapshot.isPlayerMoving, positions),
    speech:
      speech === null
        ? null
        : { key: `${speech.occurrenceId}|${speech.optionId}`, success: speech.success },
    line: lineOf(snapshot),
  }
}

/** Игрок сидит на своей паре — в том самом помещении, где она идёт. */
export function inLesson(snapshot: WorldSnapshot): boolean {
  const lesson = snapshot.currentLesson
  return lesson !== null && snapshot.currentRoom === lesson.room
}

export function musicSituationOf(snapshot: WorldSnapshot, dayKind: MusicSituation['dayKind']): MusicSituation {
  return {
    dayScreen: snapshot.dayScreen?.kind ?? null,
    dayKind,
    minutes: snapshot.minutes,
    inLesson: inLesson(snapshot),
  }
}

export function ambienceSituationOf(snapshot: WorldSnapshot): AmbienceSituation {
  return {
    room: snapshot.currentRoom,
    lessonHere: inLesson(snapshot),
    minutesToLesson: snapshot.nextLesson?.startsInMinutes ?? null,
    night: isNight(snapshot.minutes),
  }
}

/**
 * Приглушать ли фон.
 *
 * Приглушается всё то время, что на экране висит разговор, а не только
 * пока звучит вокализ: игрок читает реплику дольше, чем длится
 * бормотание, и музыка, вернувшаяся на полную громкость посреди чтения,
 * — это ровно тот рывок, ради отсутствия которого приглушение и заводят.
 */
export function inConversation(snapshot: WorldSnapshot): boolean {
  return snapshot.activeDialogue !== null || snapshot.activeChain !== null
}
