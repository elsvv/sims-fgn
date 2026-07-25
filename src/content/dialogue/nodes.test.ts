import { describe, expect, it } from 'vitest'
import {
  isUnconditional,
  validateDialogueCatalog,
  type DialogueOption,
} from '../../sim/dialogue/Dialogue'
import { isSkillId } from '../../sim/player/Skills'
import { createRelationship } from '../../sim/social/Relationship'
import { TEACHERS } from '../people/teachers'
import { DIALOGUE_BOOKS, DIALOGUE_NODES, dialogueNodeFor, nodesOf } from './nodes'

const NODES = Object.values(DIALOGUE_NODES)

/** Реплика, требующая навыка или прочитанной книги, — «содержательная». */
function isSubstantial(option: DialogueOption): boolean {
  return option.requires?.skillId !== undefined || option.requires?.book !== undefined
}

/** Реплика, стоящая уважения, — «дерзкая». */
function isBold(option: DialogueOption): boolean {
  return (option.effects.respect ?? 0) < 0
}

describe('каталог диалогов', () => {
  it('проходит проверку узлов', () => {
    expect(validateDialogueCatalog(DIALOGUE_NODES)).toEqual([])
  })

  it('у каждого из шести преподавателей не меньше двух узлов', () => {
    for (const teacher of Object.values(TEACHERS)) {
      expect(nodesOf(teacher.id).length, teacher.id).toBeGreaterThanOrEqual(2)
    }
  })

  it('коридорный разговор и разговор о курсе есть у каждого', () => {
    for (const teacher of Object.values(TEACHERS)) {
      const ids = nodesOf(teacher.id).map((node) => node.id)
      expect(ids, teacher.id).toContain(`${teacher.id}-hall`)
      expect(ids, teacher.id).toContain(`${teacher.id}-course`)
    }
  })

  it('каждый узел приписан существующему преподавателю', () => {
    for (const node of NODES) {
      expect(TEACHERS[node.speakerId], node.id).toBeDefined()
    }
  })

  it('в каждом узле не меньше трёх ответов', () => {
    for (const node of NODES) {
      expect(node.options.length, node.id).toBeGreaterThanOrEqual(3)
    }
  })

  it('в каждом узле есть безусловный ответ — меню не может опустеть', () => {
    for (const node of NODES) {
      expect(node.options.some(isUnconditional), node.id).toBe(true)
    }
  })

  it('в каждом узле есть содержательный ответ: навык или прочитанная книга', () => {
    for (const node of NODES) {
      expect(node.options.some(isSubstantial), node.id).toBe(true)
    }
  })

  it('в каждом узле есть ответ, открываемый навыком', () => {
    for (const node of NODES) {
      const gated = node.options.some((option) => option.requires?.skillId !== undefined)
      expect(gated, node.id).toBe(true)
    }
  })

  it('в каждом узле есть дерзкий ответ, стоящий уважения', () => {
    for (const node of NODES) {
      expect(node.options.some(isBold), node.id).toBe(true)
    }
  })

  it('дерзкий ответ платит уважением, но что-то и даёт', () => {
    for (const node of NODES) {
      for (const option of node.options.filter(isBold)) {
        expect(option.effects.affection ?? 0, `${node.id}/${option.id}`).toBeGreaterThan(0)
      }
    }
  })

  it('содержательный ответ приносит уважение', () => {
    for (const node of NODES) {
      for (const option of node.options.filter(isSubstantial)) {
        expect(option.effects.respect ?? 0, `${node.id}/${option.id}`).toBeGreaterThan(0)
      }
    }
  })

  it('ответ на уважение двигает игрока туда, где стоит преподаватель', () => {
    for (const node of NODES) {
      const position = TEACHERS[node.speakerId]!.factionPosition
      for (const option of node.options) {
        const shift = option.effects.faction ?? 0
        if ((option.effects.respect ?? 0) <= 0 || shift === 0) continue
        expect(Math.sign(shift), `${node.id}/${option.id}`).toBe(Math.sign(position))
      }
    }
  })

  it('дерзкий ответ двигает игрока прочь от преподавателя', () => {
    for (const node of NODES) {
      const position = TEACHERS[node.speakerId]!.factionPosition
      for (const option of node.options.filter(isBold)) {
        const shift = option.effects.faction ?? 0
        if (shift === 0) continue
        expect(Math.sign(shift), `${node.id}/${option.id}`).toBe(-Math.sign(position))
      }
    }
  })

  it('сдвиги по шкале традиций не двигают игрока рывками', () => {
    for (const node of NODES) {
      for (const option of node.options) {
        expect(Math.abs(option.effects.faction ?? 0), `${node.id}/${option.id}`).toBeLessThanOrEqual(12)
      }
    }
  })

  it('навыки в эффектах и условиях существуют', () => {
    for (const node of NODES) {
      for (const option of node.options) {
        const required = option.requires?.skillId
        if (required !== undefined) {
          expect(isSkillId(required), `${node.id}/${option.id}: ${required}`).toBe(true)
        }
        const gained = option.effects.skill?.id
        if (gained !== undefined) {
          expect(isSkillId(gained), `${node.id}/${option.id}: ${gained}`).toBe(true)
        }
      }
    }
  })

  it('каждая упомянутая книга есть в списке книг', () => {
    for (const node of NODES) {
      for (const option of node.options) {
        const book = option.requires?.book
        if (book === undefined) continue
        expect(DIALOGUE_BOOKS[book], `${node.id}/${option.id}: ${book}`).toBeDefined()
      }
    }
  })

  it('у каждого преподавателя своя книга — иначе список ни на что не влияет', () => {
    const books = NODES.flatMap((node) =>
      node.options.map((option) => option.requires?.book).filter((book) => book !== undefined),
    )
    expect(new Set(books).size).toBe(Object.keys(TEACHERS).length)
  })

  it('первый шаг лесенки бесплатный: безусловный ответ где-то учит', () => {
    for (const teacher of Object.values(TEACHERS)) {
      const free = nodesOf(teacher.id)
        .flatMap((node) => node.options)
        .filter(isUnconditional)
      expect(free.some((option) => option.effects.skill !== undefined), teacher.id).toBe(true)
    }
  })

  it('требования по навыку выполнимы: порог не выше потолка шкалы', () => {
    for (const node of NODES) {
      for (const option of node.options) {
        const min = option.requires?.skillMin
        if (min === undefined) continue
        expect(min, `${node.id}/${option.id}`).toBeGreaterThan(0)
        expect(min, `${node.id}/${option.id}`).toBeLessThanOrEqual(10)
      }
    }
  })

  it('идентификаторы ответов не повторяются внутри узла', () => {
    for (const node of NODES) {
      const ids = node.options.map((option) => option.id)
      expect(new Set(ids).size, node.id).toBe(ids.length)
    }
  })

  it('реплики не повторяются дословно у разных собеседников', () => {
    const seen = new Map<string, string>()
    for (const node of NODES) {
      for (const line of [node.prompt, ...node.options.map((option) => option.reply)]) {
        const owner = seen.get(line)
        expect(owner, `«${line}» есть и у ${owner}, и у ${node.speakerId}`).toBeUndefined()
        seen.set(line, node.speakerId)
      }
    }
  })

  it('ответы в разговоре не копируют дословно готовые реплики преподавателя', () => {
    const canned = new Set(Object.values(TEACHERS).flatMap((t) => Object.values(t.lines).flat()))
    for (const node of NODES) {
      for (const line of [node.prompt, ...node.options.map((option) => option.reply)]) {
        expect(canned.has(line), `${node.id}: «${line}»`).toBe(false)
      }
    }
  })

  it('в репликах нет служебных пометок — они живут в комментариях', () => {
    for (const node of NODES) {
      const lines = [
        node.prompt,
        ...node.options.map((option) => option.text),
        ...node.options.map((option) => option.reply),
      ]
      for (const line of lines) {
        expect(line, node.id).not.toMatch(/\[[^\]]*\]/)
        expect(line, node.id).not.toMatch(/допущение|источник|research\//i)
      }
    }
  })

  it('реплики — законченные фразы, а не заготовки', () => {
    for (const node of NODES) {
      const lines = [
        node.prompt,
        ...node.options.map((option) => option.text),
        ...node.options.map((option) => option.reply),
      ]
      for (const line of lines) {
        expect(line.trim(), node.id).toBe(line)
        expect(line.length, `${node.id}: «${line}»`).toBeGreaterThan(10)
        expect(line, `${node.id}: «${line}»`).toMatch(/[.!?:)…»]$/)
      }
    }
  })
})

describe('выбор узла по знакомству', () => {
  it('с незнакомым преподавателем начинается разговор в коридоре', () => {
    expect(dialogueNodeFor('marey', createRelationship())).toBe('marey-hall')
  })

  it('со знакомым разговор идёт о курсе', () => {
    expect(dialogueNodeFor('marey', { affection: 0, respect: 20 })).toBe('marey-course')
  })

  it('симпатии тоже достаточно, чтобы перейти к делу', () => {
    expect(dialogueNodeFor('marey', { affection: 20, respect: 0 })).toBe('marey-course')
  })

  it('поссорившись, к коридорному знакомству не возвращаются', () => {
    expect(dialogueNodeFor('marey', { affection: -50, respect: -50 })).toBe('marey-course')
  })

  it('у каждого преподавателя разговор находится', () => {
    for (const teacher of Object.values(TEACHERS)) {
      expect(dialogueNodeFor(teacher.id, createRelationship()), teacher.id).not.toBeNull()
    }
  })

  it('у постороннего разговора нет', () => {
    expect(dialogueNodeFor('вахтёр', createRelationship())).toBeNull()
  })
})
