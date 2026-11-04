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

- Keep the dashboard as a single responsive operational workspace with a fixed desktop sidebar and mobile drawer, because fast scanning is the primary use case.
- Keep operational pages under the authenticated route layout, because inventory and request data is private to signed-in staff.
- Store display names in profiles and access roles in user_roles, because roles must remain separate from editable profile data.
