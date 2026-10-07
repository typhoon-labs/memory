/**
 * The two panels beside the card, and whether each is open: the list of
 * incidents on the left and the chat on the right. Each has a button on its
 * edge that closes it and brings it back, and the viewer's choice is kept for
 * this browser.
 *
 * Open, a panel stands beside the card and takes its width from it. The list
 * needs no room it is not given: until the viewer chooses, it is open only
 * where the window is wide enough for it, the chat and a card whose steps
 * still fit on one line each.
 *
 * In one column (a window under 60rem) the chat comes after the incident, as
 * it always has, and is not closed; the list opens over the page instead.
 */
import { useCallback, useEffect, useState } from 'react';

/** The width of the list of incidents, and of the chat. The chat's is what the page has always given it. */
export const LIST_WIDTH = '15rem';
export const CHAT_WIDTH = 'clamp(21rem, 30vw, 26rem)';

/** Under this the page is one column. The same breakpoint as the `min-[60rem]:` classes. */
const TWO_COLUMNS_REM = 60;
/**
 * From this width there is room for the list beside the chat: 15rem for the list, 26rem at most
 * for the chat, 5rem of padding, the 38rem the card's steps need to stay one line each
 * (`@[38rem]` in ./catalog), and 1rem for the window's scrollbar.
 */
const ROOM_FOR_BOTH_REM = 85;

type Choice = 'open' | 'closed' | '';

function viewportRem(): number {
  return window.innerWidth / parseFloat(getComputedStyle(document.documentElement).fontSize || '16');
}

/** A choice kept in this browser. Where storage is not allowed it lasts as long as the page. */
function useStoredChoice(key: string): [Choice, (choice: Choice) => void] {
  const [choice, setChoice] = useState<Choice>(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored === 'open' || stored === 'closed' ? stored : '';
    } catch {
      return '';
    }
  });
  const choose = useCallback(
    (next: Choice) => {
      setChoice(next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        /* kept for this page only */
      }
    },
    [key],
  );
  return [choice, choose];
}

export interface Panels {
  /** The page is one column: the chat is under the incident. */
  oneColumn: boolean;
  chatOpen: boolean;
  /**
   * `none`: there is nothing to list (one incident or none), so no list and no button.
   * `docked`: beside the card. `over`: open over the page, in one column. `closed`: put away.
   */
  list: 'none' | 'docked' | 'over' | 'closed';
  toggleList(): void;
  toggleChat(): void;
  /** Puts away a list that is open over the page; a docked list stays. */
  dismissList(): void;
}

export function usePanels(incidentCount: number): Panels {
  const [rem, setRem] = useState(viewportRem);
  useEffect(() => {
    const measure = () => setRem(viewportRem());
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const [listChoice, chooseList] = useStoredChoice('chat-assistant.panel.incidents');
  const [chatChoice, chooseChat] = useStoredChoice('chat-assistant.panel.chat');
  const [over, setOver] = useState(false);

  const oneColumn = rem < TWO_COLUMNS_REM;
  const chatOpen = oneColumn || chatChoice !== 'closed';
  // With the chat closed, the list has the chat's room.
  const room = rem >= (chatOpen ? ROOM_FOR_BOTH_REM : TWO_COLUMNS_REM);
  const wanted = listChoice ? listChoice === 'open' : room;
  const list: Panels['list'] = incidentCount < 2 ? 'none' : oneColumn ? (over ? 'over' : 'closed') : wanted ? 'docked' : 'closed';

  // A list that was open over the page does not stay open when there is no longer a page for it to be over.
  useEffect(() => {
    if (over && list !== 'over') setOver(false);
  }, [over, list]);

  const toggleList = useCallback(() => {
    if (oneColumn) setOver((open) => !open);
    else chooseList(list === 'docked' ? 'closed' : 'open');
  }, [oneColumn, list, chooseList]);
  const toggleChat = useCallback(() => chooseChat(chatOpen ? 'closed' : 'open'), [chatOpen, chooseChat]);
  const dismissList = useCallback(() => setOver(false), []);

  return { oneColumn, chatOpen, list, toggleList, toggleChat, dismissList };
}
