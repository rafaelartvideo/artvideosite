export function changedServiceTypeSituationLinks(desiredLinks, existingLinks) {
  const existingBySituation = new Map(existingLinks.map(link => [link.situation_id, link]));

  return desiredLinks.flatMap(link => {
    const current = existingBySituation.get(link.situation_id);
    if (!current) return [link];

    const currentHours = current.sla_hours == null ? null : Number(current.sla_hours);
    const nextHours = link.sla_hours == null ? null : Number(link.sla_hours);
    const changed = current.use_default_hours !== link.use_default_hours
      || currentHours !== nextHours;

    if (!changed) return [];

    return [{
      ...link,
      sort_order: Number.isFinite(Number(current.sort_order))
        ? Number(current.sort_order)
        : link.sort_order,
    }];
  });
}
