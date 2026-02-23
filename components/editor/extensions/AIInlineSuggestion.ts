import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'

const DEBOUNCE_MS = 1800

interface SuggestionState {
  text: string
  pos: number
}

const pluginKey = new PluginKey<SuggestionState>('ai-inline')

export type FetchSuggestion = (context: string, fullText: string) => Promise<string>

export const AIInlineSuggestion = Extension.create<{ fetch: FetchSuggestion }>({
  name: 'aiInlineSuggestion',

  addOptions() {
    return { fetch: async () => '' }
  },

  addProseMirrorPlugins() {
    const fetchFn = this.options.fetch
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    return [
      new Plugin({
        key: pluginKey,

        state: {
          init: (): SuggestionState => ({ text: '', pos: 0 }),
          apply(tr, prev): SuggestionState {
            if (tr.docChanged) return { text: '', pos: 0 }
            return (tr.getMeta(pluginKey) as SuggestionState | undefined) ?? prev
          },
        },

        view() {
          return {
            update(view, prevState) {
              if (!view.state.doc.eq(prevState.doc)) {
                if (debounceTimer) clearTimeout(debounceTimer)

                debounceTimer = setTimeout(async () => {
                  const snap = view.state
                  const { from } = snap.selection
                  const fullText = snap.doc.textContent

                  if (fullText.trim().length < 15) return

                  const context = snap.doc
                    .textBetween(0, Math.min(from, snap.doc.content.size), ' ', '\n')
                    .slice(-300)

                  try {
                    const suggestion = await fetchFn(context, fullText)
                    if (suggestion && view.state.doc.eq(snap.doc)) {
                      view.dispatch(
                        view.state.tr.setMeta(pluginKey, { text: suggestion, pos: from })
                      )
                    }
                  } catch { /* network error — silently skip */ }
                }, DEBOUNCE_MS)
              }
            },
            destroy() {
              if (debounceTimer) clearTimeout(debounceTimer)
            },
          }
        },

        props: {
          decorations(state) {
            const { text, pos } = this.getState(state) ?? { text: '', pos: 0 }
            if (!text || pos <= 0 || pos > state.doc.content.size) return DecorationSet.empty

            const el = document.createElement('span')
            el.className = 'ai-suggestion'
            el.textContent = text

            return DecorationSet.create(state.doc, [
              Decoration.widget(pos, () => el, { side: 1, key: 'ai-suggestion' }),
            ])
          },

          handleKeyDown(view, event) {
            const { text, pos } = this.getState(view.state) ?? { text: '', pos: 0 }
            if (!text) return false

            if (event.key === 'Tab') {
              event.preventDefault()
              view.dispatch(
                view.state.tr
                  .insertText(text, pos)
                  .setMeta(pluginKey, { text: '', pos: 0 })
              )
              return true
            }

            if (event.key === 'Escape') {
              view.dispatch(view.state.tr.setMeta(pluginKey, { text: '', pos: 0 }))
              return false
            }

            if (event.key.length === 1 || event.key === 'Backspace') {
              view.dispatch(view.state.tr.setMeta(pluginKey, { text: '', pos: 0 }))
            }

            return false
          },
        },
      }),
    ]
  },
})
