# The Chat UI: layout, colors and panels

> **Owner:** chat-assistant maintainers · **Type:** reference · **Checked:** 2026-11-03 against chat-assistant 0.1.12

How the Chat UI (`packages/ui`) lays out the page, what its colors say, and
when the panels beside the incident card are open. What the page shows and
what the server sends it are in the component's [README](../README.md).

## Layout

The incident is in the middle, the chat pane on its right and, once there is
more than one incident, the list of incidents on its left; in a narrow window
the chat comes after the incident.

## Colors

The page is white and gray, and color says two things. Whose tab it is: a
line along the top, the role's name beside the app's, the step it is the
viewer's turn on and the tab's icon take the role's color, blue for
`developer`, violet for `incident-manager`, teal for `platform-engineer`.
And what a status or an outcome means: red for an incident that is open or
critical and for a refusal by the gateway, amber for an incident being
mitigated and for a refusal by the service, green for resolved. The theme
is in [`packages/ui/src/index.css`](../packages/ui/src/index.css).

## The panels beside the card

The list and the chat each have a button on their edge, halfway down the
window, that closes the panel and brings it back. Closed, the panel is gone,
the card has its room, and the button is on the window's edge. The choice is
kept in the browser (`localStorage`, `chat-assistant.panel.*`).

- Until the viewer chooses, the list is open only where the window has room
  for it beside the chat without narrowing the card: from 85rem. With the
  chat closed the list has the chat's room, and is open from 60rem. A viewer
  who opens it in a narrower window gets a narrower card, whose steps then
  stack.
- A button pressed on the card reports in the chat. While the chat is closed
  its edge button carries a dot for anything that arrived there.
- The window scrolls the incident, and the bar at the top, the list and the
  chat stay in place. The incident's scrollbar is then the window's, at the
  far right, and not on the edge of the chat, where the chat's button is.
- In one column (a window under 60rem) the chat is under the incident and is
  not closed, and the list opens over the page from its edge button.
