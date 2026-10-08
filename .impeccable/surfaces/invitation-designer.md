---
version: 1
slug: "invitation-designer"
primary_target: "src/pages/Events/InvitationPage.tsx"
related_targets:
  - "src/components/invitations/InvitationDesigner.tsx"
  - "src/pages/Invite/InvitePage.tsx"
---

# Invitation designer

Mode: operate

Audience: an event manager at a desk, building one reusable email invitation.
Job: finish a template in a few minutes without touching HTML.
Task: upload a header, confirm guest name and position, upload the details image, upload accept and decline images, check the preview, save.
Constraints: the brief pins a 560px card, charcoal #313131, white guest type, and the six-step sequence. GrapesJS stays headless. The galley chrome stays the dashboard's.

## Direction contract

THESIS: The invitation is a single charcoal card on a quiet workspace, and the manager only walks the four blocks that card is made of. The page refuses a free canvas, a component tree, and any code panel.

OWN-WORLD: Dashboard paper, sheet, and hairline rules for the steps. The workspace behind the card is a flat neutral gray. The card itself is #313131, 560px, with white guest lines. Spruce is only the save action. No second accent, no shadow on the card.

STORY: The manager uploads pictures, leaves the guest tags assigned for them, and sees Sara Ahmed in the card the whole time. Saving stores one template. Each guest's name and position are filled in later, and an empty position leaves no blank line.

FIRST VIEWPORT: A 56px bar holds Back, the title, and Save template. Below, a 22rem step column sits on the left and the card stays centered in the workspace. The current step's fields sit under the step list, not in a modal.

FORM: Brief-pinned stepped editor. No concept roll: the specification fixed the sequence, the width, and the charcoal card. Chrome is the typesetter's galley translated onto this tool.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
