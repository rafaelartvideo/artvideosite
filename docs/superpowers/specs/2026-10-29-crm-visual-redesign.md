# CRM visual redesign

The user rejected the prior conservative refresh and explicitly requested a visible redesign, a menu resembling the Artvideo customer account, standard subsections and properly integrated search/actions, with Sites used for preview. They delegated layout/color decisions while retaining the familiar blue identity.

Direction: light semantic sidebar (sober dark variant), 44px navigation rows, active blue left marker and soft selected background, quieter workspace header, white rounded panels, sentence-case headings, consistent compact tabs and search/creation positions. References: the actual CustomerAccountPage navigation and Linear/Atlassian navigation systems. This is a structural refresh, rather than a palette-only update or a new route/module architecture.

Preserve permissions, module visibility, tenant isolation, forms, route contracts, optional company logos and all data operations. New/existing backend behavior is out of scope. Do not introduce loading screens or decorative animation.

Shared AdminSectionNav powers both section-navigation wrappers. Equipment tabs and search share a toolbar; creation belongs in the page header. Adjacent operational screens follow that action location. Shared filter headers use neutral surfaces, with primary blue reserved for focus, selection and actions.

Sites hosts a private interactive visual preview using fictitious data and the actual shared CRM UI components. The existing operational CRM remains at unionworld.com.br/admin and continues the GitHub/HostGator publication workflow; no hosting/domain/backend migration is requested.

Validate with existing regression suites, both builds, preview browser inspection in light/dark themes, then verify the published CRM. Style-only edits do not need tests mirroring class strings. Add behavioral navigation tests where shared scrolling/accessibility behavior changes.
