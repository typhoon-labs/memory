# Confluence page set: agent platform on AWS

The Confluence version of the architecture review in the parent directory,
written as a high-level overview for managers, architects, developers and
platform engineers. One Markdown file is one Confluence page. This README
describes the set and how to publish it; it is not a page.

Updated 4 November 2026. Screenshots are from a demo incident run on 4
November 2026 at 09:54 UTC.

## Page tree

```
Agent platform on AWS                          00  overview and decision request
├── Agent platform: Architecture                01
├── Agent platform: Building on the platform    02
├── Agent platform: Security and identity       03
├── Agent platform: Running the platform        04
├── Agent platform: Cost                        05
├── Agent platform: Roadmap and pilots          06
├── Agent platform: Decisions and open questions 07
└── Agent platform: Reference                   10
    ├── Agent platform: Technology assessments  11
    ├── Agent platform: Demo walkthrough        12
    ├── Agent platform: Identity profile and tests 13
    └── Agent platform: Glossary and sources    14
```

Titles carry the "Agent platform:" prefix because Confluence titles must be
unique in a space. The number prefix is only the file order; it is not part
of the title.

## Who reads what

| Page | Managers | Architects | Developers, platform engineers |
|---|---|---|---|
| Agent platform on AWS | **Read** | **Read** | **Read** |
| Architecture | Skim | **Read** | **Read** |
| Building on the platform | Skip | Skim | **Read** |
| Security and identity | Skim | **Read** | **Read** |
| Running the platform | Skim | **Read** | **Read** (platform engineers) |
| Cost | **Read** | Skim | Skip |
| Roadmap and pilots | **Read** | **Read** | Skim |
| Decisions and open questions | **Read** | **Read** | Skim |
| Reference pages | As needed | As needed | As needed |

## Every page follows one layout

1. **Properties table** directly under the title: Status, Owner, Audience,
   Updated. Publish it inside a **Page Properties** macro, so the Reference
   page or a report page can list every page's status.
2. **"In short"**: three bullets in a blockquote. Publish as an **Info** panel
   inside an **Excerpt** macro; the overview page can then show each child's
   summary with **Excerpt Include** or **Children Display** with excerpts.
3. **At most four sections**, each starting with its conclusion.
4. **"Not decided yet"** where it applies: a blockquote starting with
   **Not decided yet**. Publish as a **Note** panel that links to Decisions.
5. **"Go deeper"**: links to the reference pages and to the detailed review
   in GitLab. Publish as a **Tip** panel.

Word budget: overview about 500 words; main pages up to about 900 words.
Reference pages may be longer but put detail in **Expand** macros
(`<details>` in the Markdown).

## Markdown to Confluence

| In the Markdown | In Confluence |
|---|---|
| `# Title` | Page title (not repeated in the body) |
| The two-column table after the title | Page Properties macro |
| `> **In short**` blockquote | Excerpt macro containing an Info panel |
| `> **Not decided yet**` blockquote | Note panel |
| `> **Go deeper**` blockquote | Tip panel |
| `<details><summary>…</summary>…</details>` | Expand macro |
| `![alt](diagrams/x.png)` and `![alt](../screenshots/x.png)` | Attached image, alt text kept |
| Link to a sibling `.md` file | Link to that Confluence page |
| Link to `../NN-…md` | Link to the file in GitLab (replace `../` with the GitLab URL of this review's directory) |
| Tables | Native tables |

## Attachments

All images are PNG so they display on Confluence Cloud and Data Center alike.
SVG versions exist for higher fidelity where the space supports them.

| Image | Used on | Source |
|---|---|---|
| `diagrams/platform-at-a-glance.png` | 00 | `../scripts/build_diagrams.py` (SVG in `../diagrams/`) |
| `diagrams/platform-architecture.png` | 01 | `../scripts/build_diagrams.py` |
| `diagrams/credential-hops.png` | 03, 13 | `../scripts/build_diagrams.py` |
| `diagrams/cost-sensitivity.png` | 05 | `../scripts/cost_model.py` |
| `diagrams/developer-lifecycle.png` | 02 | `diagrams/src/developer-lifecycle.mmd` |
| `diagrams/two-charts.png` | 02 | `diagrams/src/two-charts.mmd` |
| `diagrams/four-record-streams.png` | 04 | `diagrams/src/four-record-streams.mmd` |
| `diagrams/roadmap.png` | 06 | `diagrams/src/roadmap.mmd` |
| `diagrams/demo-incident.png` | 12 | `diagrams/src/demo-incident.mmd` |
| `../screenshots/incident-*.png` (15) | 00, 03, 04, 12 | Demo incident, 4 November 2026 |
| `../screenshots/01`, `03`, `06`, `07`, `10`, `14` | 12 | Demo platform views, 4 November 2026 |

Mermaid sources are rendered with Mermaid 11 (theme `neutral`, SVG text
labels) and given a white background, so text stays readable in
Confluence's dark theme. If the space has a Mermaid app, the `.mmd` sources
can be pasted instead.

## Decisions made for this page set

These were open in the planning discussion and are set here as defaults.
Change them before publishing if they are wrong.

| Question | Default |
|---|---|
| Confluence edition and apps | Unknown: plain PNG attachments, standard macros only |
| Where detail lives | The 20-page review stays in GitLab as the evidence; Confluence links to it |
| Purpose of the overview | A decision request (approve phase 0 and 1), readable as an overview |
| The October page tree (`../../agent-platform/`) | Superseded by this set; archive it or link to this set from its parent page |
| Decision tracking | On the Decisions page; move the register to Jira if that is the team's practice |

## Publishing

1. Create the parent page, then the children in the order of the tree.
2. Attach each page's images, then paste its content, converting the elements
   in the table above.
3. Replace `../` links with GitLab URLs.
4. Add labels: `agent-platform`, `architecture`, `proposal`, and the page's
   audience (`managers`, `architects`, `engineers`).
5. On the Reference page, add a **Page Properties Report** filtered on the
   `agent-platform` label to list every page with its status and owner.
