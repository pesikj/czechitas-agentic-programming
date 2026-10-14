**Product concept: Czechitas Course Terminal**

A Czech-language learning website presenting course materials in a workspace inspired by the command line. It supports courses using Codex CLI and Claude Code.

**Product promise**

“I know what to do next, understand why I am doing it, and can check whether it worked.”

The website accompanies an instructor-led course through readable materials, command navigation, and optional short exercise responses. It is not a self-paced learning platform.

**Product scope**

The website defines how materials are presented and how learners interact with them. The content repository defines their structure and sequence.

No syllabus, lecture count, topic hierarchy, or learning sequence is hardcoded into the website.

Course content is available only to signed-in users with active accounts created by an administrator. The exception is lectures the content repository marks as public (for example, tool installation, so learners can prepare before their account exists): anyone can read them without signing in. All active users see the same published content; there are no cohort-specific content permissions.

**Users and roles**

| Role | Capabilities |
|---|---|
| Learner | Read materials, navigate lecture parts, complete exercises, manage personal responses, change their password |
| Administrator | Manage user accounts, read learner responses, and manually pull and publish the newest content version |
| Content author | Maintain materials and their structure in the content repository; repository access is managed separately |

There is no public registration.

**Account creation, invitation, and first sign-in**

The administrator adds an email address or a list of email addresses. The website validates entries, identifies duplicates, and reports the result for each address.

For every newly created account:

1. The system generates a unique one-time password.
2. The system automatically sends an invitation email.
3. The user follows the sign-in link and enters their email address and one-time password.
4. The website immediately requires a new password.
5. After the password change succeeds, the user can access the course.

The invitation contains the website’s sign-in link, the account email address, the one-time password, an explanation of the required password change, and instructions for getting help.

The one-time password permits only the initial password-change flow. It does not grant access to course materials and cannot start another sign-in after successful use.

If activation is interrupted and cannot be resumed, an administrator can issue a replacement invitation.

**Invitation delivery and resending**

The administration area shows invitation-sending status separately from account activation. An email accepted for sending does not mean that the learner has received it or activated their account.

Sending failures leave the account available for retry. Resending an invitation generates a replacement one-time password and invalidates the previous one. The email tells the learner to use the latest invitation.

Bulk creation reports account creation and invitation-sending results for each address.

**Password recovery**

The sign-in page provides **Zapomenuté heslo**. A user enters their account email address and receives a time-limited, single-use password-reset link by email. Following the link lets them choose a new password and return to sign-in. Recovery changes credentials for an existing active account; it does not create an account or reactivate a deactivated one.

The request screen gives a neutral confirmation. Expired or used links offer a way to request a replacement. Administrators retain the ability to reset credentials if assistance is needed.

**Administrator account management**

A searchable user list shows email address, role, account status, invitation status, and whether a password change is required.

Administrators can:

- Create accounts individually or from a list of email addresses.
- Modify email addresses and roles.
- Resend invitations to users awaiting activation.
- Deactivate and reactivate accounts.
- Issue replacement one-time passwords and require password changes.
- Delete accounts after explicit confirmation.

Failed or duplicate entries do not prevent valid bulk entries from being processed.

Deactivation blocks sign-in and ends existing access while retaining the learner’s work. Resetting credentials invalidates previous credentials and existing sessions, and emails a replacement one-time password.

Administrators cannot retrieve chosen passwords. The interface prevents removal or deactivation of the last active administrator.

**Open decision:** Whether account deletion permanently removes exercise responses or retains them for a defined period. The confirmation must explain the agreed behaviour.

**Access boundaries**

Signed-out visitors can open the title page, which lists only the public lectures and invites them to sign in; the sign-in page also links to the public lectures. Public lectures show only public lectures in their navigation, offer no search, and invite visitors to sign in to save answers. Opening a protected link leads to sign-in, then returns the user to the requested page or lecture part after any required password change.

Access restrictions cover course text, search results, images, downloads, and other attachments. Protected materials must not be included in publicly accessible website files.

Learners can access only their own responses. Administrators can read all saved learner responses. The response panel explains that saving makes the answer visible to administrators.

**Dynamic content and navigation**

The directory **`czechitas-agentic-programming-content`** is the source of truth for course materials. The separate **`czechitas-agentic-programming`** project contains the website.

The website reads the repository to generate:

- Navigation and content hierarchy.
- Lectures, their parts, and their ordering.
- Titles, breadcrumbs, and the current part number.
- Forward and backward navigation.
- Search results.
- Exercises and response fields.
- Images, attachments, and optional tool-specific alternatives.

Adding, splitting, moving, reordering, or removing content requires repository changes without corresponding website code changes.

A documented content contract will specify how Markdown files, assets, and metadata describe this structure. Content retrieval and publishing must preserve signed-in-only access.

**Manual content updates**

The administration area provides **Aktualizovat obsah**. This action pulls the newest version from the configured content repository branch and publishes it to the website. Repository changes are never pulled or published automatically, and learner page visits do not trigger a pull.

The update validates structure, identifiers, and referenced assets before activating the new content. On success, navigation, pages, images, and search use the same new revision. On failure, the previous working version stays available and the administrator sees an actionable error.

The administration area shows the active revision, the time of the last successful update, and the current update result. Only administrators can trigger updates. All learners receive the same published version. Updating content does not modify or delete saved responses.

**Lectures split into parts**

A lecture may contain one part or multiple ordered parts. The author defines the boundaries and sequence in the content repository.

The website displays one part at a time. Each part can contain formatted text, images, code examples, exercises, or a combination of these.

The interface shows the lecture title, current part title, and position, such as **Část 2 z 6**. Each part has a stable address so learners can bookmark it and instructors can link directly to it.

The part number is orientation within the lecture, not a learning-progress measure. There is no saved reading position, completion tracking, resume feature, or personalized dashboard.

The home screen is a simple repository-derived overview from which the learner opens a lecture. It contains no progress metrics or personalized learning path.

**Command-based movement**

Learners move forward and backward through lecture parts using the command bar.

Proposed commands are:

| Command | Behaviour |
|---|---|
| `/next` | Open the next part of the current lecture |
| `/back` | Open the previous part of the current lecture |
| `/open` | Open a lecture by its number, title or id, or a part as `lecture.part` (e.g. `/open 2.3`) |
| `/search` | Search all materials (e.g. `/search prompt`) |
| `/home` | Return to the shared home screen |
| `/help` | Show available commands and examples |

The final command names can be adjusted without changing this interaction model.

Available commands are visible near the command bar and offered as suggestions. Learners can type a command and press Enter or activate its suggestion using a pointer or keyboard.

At the first part, `/back` explains that the learner is already at the beginning. At the final part, `/next` indicates the end of the lecture and offers available destinations from the repository structure. Navigation never wraps silently or marks exercises complete.

An unknown command produces a short explanation and relevant suggestions without changing the current part.

Responses are saved explicitly. If there are unsaved edits, in-app navigation offers a simple choice to save, discard, or stay. Skipping an exercise with no edits never blocks navigation.

The navigation command bar is separate from exercise editors. **Enter executes a navigation command only when focus is in the command bar; inside a response editor, Enter inserts a newline.**

**Terminal-inspired experience**

The interface uses monospace navigation, file-like page names, a working-directory breadcrumb, bordered panels, and a command bar. Long explanations use typography optimized for reading. Dark and light themes are available.

On desktop, a navigation tree sits beside the current lecture part. On smaller screens, navigation collapses to leave room for reading and writing.

All essential actions work with mouse, touch, and keyboard. Command suggestions help beginners learn the interface without memorizing commands.

Examples distinguish terminal commands, programming code, agent prompts, and expected output. Copy buttons copy only the relevant input.

Sign-in, password changes, and administration use clearly labelled forms consistent with the visual style.

**Markdown and images**

Full Markdown formatting is supported for course materials and learner responses. Use one documented Markdown dialect consistently for rendered materials, response previews, and administrator views. The proposed baseline is CommonMark with GitHub-flavored Markdown extensions, including tables, task lists, strikethrough, and autolinks, alongside headings, nested lists, emphasis, blockquotes, links, images, and fenced code blocks.

Markdown support does not execute embedded scripts, JSX, or code examples. Raw HTML, if allowed by the chosen renderer, is sanitized. Image uploading is not implied by support for Markdown image references.

Authors can embed images using standard Markdown image syntax. Relative image paths resolve against the source content file, with image assets maintained in the content repository.

Images:

- Appear inline in their authored position.
- Resize to fit the available screen without distortion.
- Include author-provided alternative text.
- Can be opened in an enlarged view for diagrams or screenshots.
- Remain protected by the same sign-in requirement as the surrounding material.

Missing images produce a readable fallback and actionable author feedback without preventing the rest of the part from loading.

Dedicated self-checks, hint/solution widgets, and guided feedback are future features. Authors can still include explanations and examples as ordinary Markdown. Tool and operating-system selectors appear only when corresponding alternatives exist.

Search results link to the relevant lecture part.

**Exercise responses**

An exercise can provide a **Moje odpověď** panel below its instructions. The content repository controls field labels, guidance, and ordering. All exercise responses are optional and expected to be short; there are no mandatory-answer checks or navigation locks.

| Example field | Learner input |
|---|---|
| **Použitý prompt** | The prompt used with an agent, including successive attempts |
| **Výsledek a ověření** | What happened and how the learner checked it |
| **Reflexe** | What worked, what was difficult, and what to change next time |

These are examples rather than a mandatory form.

Every field accepts multiline text with full Markdown formatting. Learners switch between **Psát** and **Náhled**.

The response flow is:

1. Complete the practical task or skip the optional response.
2. Type or paste into **Moje odpověď**.
3. Preview formatting if desired.
4. Select **Uložit odpověď** to save and make the response available to administrators.
5. Return to read, edit, or download the saved response as Markdown.

Use simple explicit saving to the server. There is no autosave, persistent draft system, separate submission step, or approval workflow. Show a saving indicator, then a success message only after the server confirms the save. On failure, keep the current text in the editor and allow retry. Unsaved text is not promised to survive a page reload or browser closure.

**Response storage and administrator reading**

Keep one current saved response per learner and exercise, with its Markdown fields, exercise revision, and last-saved timestamp. Saving an edit replaces the previous saved answer. Use a simple last-successful-save-wins policy without collaborative editing, conflict-resolution interfaces, or answer history.

Learners can reopen their own saved answers after signing in, including on another device. Responses remain separate from the content repository. Existing Markdown export can include individual responses or all of the learner's saved responses.

Administrators have a response list filterable by learner and exercise. Each entry shows the learner, lecture/exercise, last-saved time, and formatted answer. Administrators can open responses to read them; scoring, comments, feedback notifications, and review statuses are not part of the first release. Saved does not mean read or evaluated.

AI evaluation may be added in the future. The first release performs no AI evaluation and sends no responses to an AI service for that purpose.

**Content changes and saved work**

Lectures, parts, and exercises use stable identifiers so changes to titles, ordering, or file locations do not disconnect saved work.

Responses retain the exercise identifier and revision. Earlier answers remain available when an exercise changes and indicate that they refer to an earlier revision. Removing an exercise from navigation does not silently delete responses.

If a bookmarked part no longer exists, the website explains the change and offers a route back to the lecture or home screen.

Invalid content definitions produce actionable author feedback. Missing pages provide a route back to navigation or search.

Learner Markdown is rendered with executable content disabled. Prompts and code remain text.

**First release**

- Signed-in-only access to materials and assets.
- Administrator-created accounts, including bulk creation.
- Automatic email invitations with one-time passwords.
- Mandatory password changes immediately after first sign-in.
- Invitation status, failure handling, and resending.
- Account modification, deactivation, reactivation, email password recovery, administrator password reset, and deletion.
- Repository-driven lectures, parts, ordering, and navigation, updated only through an administrator-triggered pull.
- Commands for forward, backward, and home navigation.
- Full Markdown rendering with inline images and enlarged image viewing.
- Search, breadcrumbs, stable part links, and a simple shared home screen.
- Accessible terminal styling.
- Content-defined exercise forms with Markdown editing and preview.
- Optional short answers with explicit server saving, editing, export, and administrator reading.

Account-deletion retention and the duration of access after the course remain open decisions.

AI evaluation, self-checks, hints, and solution widgets are future possibilities. Progress tracking, a personalized dashboard, live AI tutoring, browser-based code execution, and certificate administration are outside the initial scope.

**Validation**

Verify account creation, invitation delivery, mandatory password changes, replacement invitations, and access revocation. Protected text and images must remain inaccessible to signed-out users.

Verify that authors can split and reorder lectures through repository changes alone. Learners must be able to move forward, backward, and home using commands, understand boundary messages, and open a direct part link. Content changes must remain unpublished until an administrator triggers an update; a failed update must leave the working version available.

Verify that images render correctly on desktop and mobile, support enlargement, and provide useful alternative text.

Verify that optional exercises never block navigation, explicit saves appear in the administrator response list, failed saves preserve text for retry, and Enter behaves correctly in each input area. Learners can reopen only their own saved answers; administrators can read all answers. Verify email password recovery and that every learner sees the same published content.

**Development evaluation: TerminalTUI**

Evaluated on 3 October 2026. Recommendation: use TerminalTUI as visual and interaction inspiration; do not adopt its runtime as the foundation of the current website. This is an architectural recommendation, not a finalized technology-stack selection.

TerminalTUI describes a TypeScript framework for actual terminal applications distributed through npm or accessed over SSH. It provides components, themes, keyboard navigation, forms, and dynamic routes. These are useful capabilities, but its documented delivery model differs from this browser-based product. [Official repository](https://github.com/OmarMusayev/terminaltui)

Its architecture renders content blocks into ANSI terminal output through local-process or SSH transports. A browser renderer is not documented in the reviewed architecture. Its HTTP API support should not be mistaken for an HTML website renderer. [Architecture](https://raw.githubusercontent.com/OmarMusayev/terminaltui/main/ARCHITECTURE.md)

| Product requirement | Assessment |
|---|---|
| Terminal appearance and command navigation | Good design reference for borders, focus indicators, themes, and command hints. Our `/next` and `/back` commands can operate directly on browser navigation state. |
| Repository-driven Markdown and lecture parts | Dynamic routes and Markdown support provide useful concepts, but our content contract, repository loader, identifiers, and lecture sequence still require implementation. |
| Images and diagrams | TerminalTUI supports images, with pixel rendering in compatible terminals and character-cell fallbacks elsewhere. For this product, native browser images offer a more direct route to readable screenshots, alternative text, and enlargement. |
| Markdown response editing | Terminal input components exist, but browser editing, previews, explicit saving, and accessible focus behaviour still need a suitable implementation. |
| Invitations, one-time passwords, administration | The required account lifecycle is not documented as a ready-made feature. It remains application functionality to build or integrate. |
| Saved exercise responses | UI state persistence alone does not establish the required account-owned storage and access rules. |
| Mobile, touch, and accessibility | The reviewed documentation does not establish these browser requirements. They would need separate implementation and validation. |

Image behaviour and available component categories are described on the [official website](https://terminaltui.dev/). Suitability assessments in the table are our conclusions against the product requirements, not claims made by TerminalTUI.

**Recommended development direction**

Build a browser application using semantic HTML and CSS with terminal styling. WebTUI is the selected UI styling library; the application framework remains undecided. Keep the command bar as an application navigation control, backed by the same repository-derived ordering as clickable navigation. Use browser-native image presentation and a Markdown editor/preview, with authenticated server functionality for protected content, accounts, invitations, and learner records.

Embedding a terminal session inside a browser is technically conceivable, but would introduce a transport/session layer and additional integration work. We have not prototyped that approach, and it does not remove the need for the product's account and learning features.

Reconsider TerminalTUI if a separate terminal-native course reader or SSH learning interface becomes a requirement. It is not needed to implement the current terminal-inspired website.

Evaluation scope: official website, repository README, and architecture documentation. No package was installed and no runtime, accessibility, or security audit was performed. Some detailed documentation pages could not be retrieved; undocumented capabilities are treated as unverified rather than impossible.

**Selected UI styling library: WebTUI**

Selected by the product owner on 3 October 2026: **WebTUI (`@webtui/css`) plus a small application-specific command bar**. Use WebTUI for the website's terminal-inspired visual interface. The library selection is confirmed; implementation and usability validation remain to be completed. WebTUI does not supply the complete product.

WebTUI is a modular, pure-CSS library for terminal-style browser interfaces. It works with HTML elements and supports selective stylesheet imports. It does not require a terminal process or SSH connection. [Official website](https://webtui.ironclad.sh/) · [Introduction](https://webtui.ironclad.sh/start/intro/)

Its native input and textarea styling fits the command bar and multiline exercise responses. The textarea is a writing control, not a complete Markdown editor: preview, explicit saving, and response actions remain application features. [Input documentation](https://webtui.ironclad.sh/components/input/) · [Textarea documentation](https://webtui.ironclad.sh/components/textarea/)

Light and dark themes and adjustable typography/color variables provide a starting point for the course identity. Import only the required styles, and keep lecture prose independently styled for comfortable reading. [Theming documentation](https://webtui.ironclad.sh/start/theming/)

**Alternatives considered**

| Candidate | Relevant strengths | Product assessment |
|---|---|---|
| [WebTUI](https://webtui.ironclad.sh/) | Browser CSS, terminal-style controls and borders, modular imports | Selected styling foundation; command behaviour remains our implementation. |
| [Terminal CSS](https://terminalcss.xyz/) | Minimal CSS with typography, forms, navigation, and image-caption examples | Good fallback for a simpler, document-oriented appearance. Layout and commands remain our implementation. |
| [jQuery Terminal](https://terminal.jcubic.pl/) | Browser command interpreter with completion, command history, and configurable commands | Useful if a rich terminal transcript becomes central. For the currently small navigation command set, its interpreter and jQuery integration add machinery we do not yet need. |
| [Tuimorphic](https://tuimorphic.com/docs) | Terminal-style React components built on Base UI, including forms, navigation, and overlays | Worth revisiting if React is selected and packaged interactive components become a priority. WebTUI leaves the application framework choice open. |

These suitability judgments are specific to our product; they are not runtime benchmark results.

**How WebTUI will be used**

- Style the surrounding navigation, panels, command input, status indicators, sign-in forms, and administration controls.
- Render repository Markdown as normal web content and images as protected browser images. Markdown parsing and image enlargement are separate application features.
- Implement a small command registry for `/next`, `/back`, `/home`, and `/help`, with visible suggestions and an accessible input. Commands operate on the repository-derived lecture sequence and share navigation logic with pointer actions.
- Use a labelled multiline textarea with a separate Markdown preview for responses. Navigation shortcuts must not intercept writing in the response editor.
- Implement repository loading, search, accounts, email invitations, permissions, and persistent learner records separately. A CSS library does not provide these capabilities.

**Implementation validation**

Validate a representative lecture with multiple parts, an image, a code block, and a Markdown response. Check command navigation, mobile layout, Czech characters, multiline paste, image enlargement, and distinct Enter behaviour in commands versus responses. Include a sign-in form and a sample administration table to check consistency beyond the learning screen.

Test keyboard focus, screen-reader labels, contrast, browser zoom, and the intended desktop/mobile browsers. Standard HTML provides a useful starting point but does not certify the finished interface's accessibility. If the library's character-based spacing or global styles obstruct readable materials, scope WebTUI to the surrounding interface and use custom styles for lecture prose.

Research was limited to official documentation and project information. No dependency has been installed or prototype built as part of this evaluation.

**Product review and resolved scope — 3 October 2026**

The website is a companion to an instructor-led course. Repository-owned materials, short lecture parts, work in real development tools, and optional written reflection fit that purpose. WebTUI supplies the chosen visual styling.

The product owner's decisions resolve the earlier review recommendations:

- Administrators read saved responses; AI evaluation is a future possibility.
- Full Markdown is supported in course content and responses.
- Administrators explicitly pull and publish the newest content; updates are never automatic.
- All learners see the same published content.
- Navigation provides forward, backward, and home actions. There is no self-paced progress tracking, resume feature, or personalized dashboard.
- Forgotten passwords use email recovery.
- Answers are short and optional, with simple explicit saving and no persistent drafts.
- Dedicated self-checks, hints, and related learning widgets are deferred.

These decisions supersede the earlier recommendations for private journals, progress indicators, and complex response recovery.

**Main interaction risk**

Website navigation commands are not the same as shell commands or agent prompts. The interface should explicitly identify where each kind of input belongs. Success at `/next` is not evidence of terminal proficiency; authentic practice still happens in the learner's development environment.

Keep command suggestions actionable by click/tap, make help visible from the first visit, and test the website alongside an editor and terminal on a single laptop screen. Command focus must never steal keystrokes from an exercise response. Clarify that `/back` means the preceding lecture part while the browser Back button follows browsing history.

**Remaining implementation decisions**

- Define the content contract: lecture/part identifiers, ordering, Markdown boundaries, exercise fields, image paths, and validation rules. This defines the input to the website, not the syllabus.
- Configure the content repository and branch used by the administrator's update action.
- Finalize the Markdown dialect and supported extensions; the proposed baseline is CommonMark plus GitHub-flavored Markdown.
- Set invitation and recovery-link expiry, support ownership, and the duration of course access.
- Set account/response retention and deletion behaviour and explain administrator access to learners.
- Choose the application framework, persistence, hosting, and email delivery services. WebTUI is already selected for styling.

**Suggested delivery sequence**

1. Implement representative Markdown content with several parts, an image, an optional response, and forward/back/home commands.
2. Complete accounts, invitation email, initial password change, email recovery, protected content, explicit answer saving, and administrator reading.
3. Add the administrator content-update action, bulk account management, search, export, and operational checks.

**Validation of suitability**

Pilot with beginner learners using the website beside their real tools. Observe invitation entry, command navigation, image reading, optional response writing, and explicit saving. Test an administrator reading the response and publishing a new content revision. Verify that skipped answers do not obstruct the live lesson. Test failed saves and email recovery without adding a complex draft or progress system.
