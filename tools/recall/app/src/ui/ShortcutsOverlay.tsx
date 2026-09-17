// src/ui/ShortcutsOverlay.tsx
//
// The `?` overlay. Every shortcut the app has is listed here, and this
// list is the same one the rest of the UI labels its buttons with - if a
// key is not here, it does not exist.

import { Modal } from './bits';

const GROUPS: Array<{ title: string; items: Array<[string, string]> }> = [
  {
    title: 'Anywhere',
    items: [
      ['?', 'Show this list'],
      ['1 2 3', 'Decks, Today, Browse'],
      ['N', 'New deck'],
      ['I', 'Import cards'],
      ['G', 'Make a deck from notes'],
      ['/', 'Search the card browser'],
      ['R', 'Reload the decks from disk'],
    ],
  },
  {
    title: 'Decks',
    items: [
      ['↑ ↓', 'Move between decks'],
      ['Enter', 'Study the selected deck'],
      ['E', 'Browse its cards'],
      ['S', 'Deck settings'],
      ['Backspace', 'Delete the selected deck'],
    ],
  },
  {
    title: 'Reviewing',
    items: [
      ['Space', 'Show the answer, then grade it Good'],
      ['1 2 3 4', 'Again, Hard, Good, Easy'],
      ['Z or ⌘Z', 'Undo the last answer'],
      ['E', 'Edit this card'],
      ['S', 'Suspend it'],
      ['B', 'Bury it until tomorrow'],
      ['M', 'Mark it'],
      ['Escape', 'End the session'],
    ],
  },
  {
    title: 'Browsing cards',
    items: [
      ['Click', 'Put the cursor on a card'],
      ['⌘ or Ctrl click', 'Add to the selection'],
      ['Shift click', 'Select a range'],
      ['⌘⏎', 'Save the card you are editing'],
      ['Escape', 'Clear the search'],
    ],
  },
];

export function ShortcutsOverlay(props: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={props.onClose} wide>
      <div className="recall-shortcuts">
        {GROUPS.map((group) => (
          <div key={group.title}>
            <p className="recall-section-title">{group.title}</p>
            {group.items.map(([keys, what]) => (
              <div key={keys} className="recall-shortcut">
                <span>{what}</span>
                <span className="recall-row-gap">
                  {keys.split(' ').map((key) => (
                    <span key={key} className="recall-kbd">
                      {key}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="recall-muted" style={{ margin: 0 }}>
        Decks are Markdown files in <span className="recall-mono">~/Recall</span>. Edit one in any editor and Recall picks the change up
        when its window comes back into focus, keeping the schedule of every card you did not touch.
      </p>
    </Modal>
  );
}
