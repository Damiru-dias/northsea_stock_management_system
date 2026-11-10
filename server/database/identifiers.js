const entityConfig = {
  order: { table: "orders", column: "order_code", prefix: "ORD" },
  request: { table: "procurement_requests", column: "request_code", prefix: "REQ" },
};

export function nextFactoryIdentifier(db, factoryId, entityType) {
  const config = entityConfig[entityType];
  if (!config) throw new Error(`Unknown factory identifier type: ${entityType}`);

  const factory = db.prepare("SELECT factory_code FROM factories WHERE id = ?").get(factoryId);
  if (!factory) throw new Error(`Factory ${factoryId} does not exist.`);

  db.prepare(`
    INSERT OR IGNORE INTO factory_sequences (factory_id, entity_type, next_value)
    VALUES (?, ?, 1)
  `).run(factoryId, entityType);
  const sequence = db.prepare(`
    UPDATE factory_sequences
    SET next_value = next_value + 1
    WHERE factory_id = ? AND entity_type = ?
    RETURNING next_value - 1 AS value
  `).get(factoryId, entityType);

  return {
    value: sequence.value,
    code: `${config.prefix}-${factory.factory_code}${String(sequence.value).padStart(4, "0")}`,
  };
}
