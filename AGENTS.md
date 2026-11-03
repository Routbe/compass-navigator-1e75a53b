<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Imported application
- Preserve the imported ROUT TanStack routes, shared components, and design system rather than replacing them with a recreated website; source fidelity is the purpose of this project.
- Keep managed project metadata, generated integrations, route-tree generation, and repository connection local to this project; source import must not copy another project identity.
- Treat db/ and drizzle/ as unapplied source references until a reviewed migration maps accounts and access boundaries to the destination; importing files does not migrate live records or credentials.
- Retain the imported cookie-session middleware without adding the generated bearer attacher; the retained account system does not use Cloud Auth yet.
- Match the imported source's compiler compatibility settings while retaining strict null checks; unrelated source rewrites would compromise import fidelity.
- Social grid edits use the shared profile block editor and revisioned drafts; social_grid_items is an owner-only synchronized index, while public hubs render published snapshots to prevent draft leaks.
- Ephemeral presence is isolated from Spotify presence functions; only text and existing published-block references enter ephemeral_statuses, with fixed server-enforced expiry and rout_qa_owner-gated public reads. Why: no duplicate content library, media uploads, or draft visibility leaks.
- Native story video is generated locally before the share click using the procedural canvas and a text composite; native share receives the prepared file synchronously. Why: a three-second recording cannot preserve transient mobile share activation.
