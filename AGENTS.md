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
