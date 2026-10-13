---
version: 1
slug: "seating"
primary_target: "src/pages/Events/SeatingPage.tsx"
related_targets:
  - "src/components/seating/SeatingDesigner.tsx"
  - "src/components/seating/FloorStage.tsx"
---

# Seating

Mode: operate

Audience: an event manager at a desk, laying out one room for one event.
Job: place tables and rows, then put each guest in a chair.
Task: choose a seating type, click the floor, drag the result, drag a guest onto a chair, save.
Constraints: the galley stays. Konva draws the shapes. Guests come from this event. The plan is stored with the event and does not change invitations, badges, or check-in codes.

## Direction contract

THESIS: The floor is the work. Tools and the guest list stay in side rails so the room stays open. The page refuses a form-only table list and a card grid of tables.

OWN-WORLD: Dashboard paper, sheet, and hairline rules. The floor is the same paper with a faint grid. Tables are ink outlines. A seated chair takes the spruce wash. Spruce is also the save action. No second hue, and no shadow on the floor.

STORY: The manager picks a seating type, clicks the floor, and drags guests onto chairs. Saving stores this event's plan. An empty guest list points back to Guests.

FIRST VIEWPORT: A 56px bar holds Back, the layout name, undo, and Save. A 18rem tool column sits on the left. The floor fills the center. An 18rem guest list sits on the right. Save is the primary action.

FORM: Brief-pinned floor editor. The existing seating app supplies the object types. Seatplan supplies direct placement on the canvas. No concept roll. Chrome is the typesetter's galley.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
