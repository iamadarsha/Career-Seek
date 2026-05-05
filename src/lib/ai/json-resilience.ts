type SchemaLike = {
  _def?: any;
  safeParse?: (value: unknown) => { success: boolean; data?: unknown; error?: any };
  parse?: (value: unknown) => unknown;
};

function zodTypeName(schema: any): string {
  return String(schema?._def?.typeName || schema?.constructor?.name || 'unknown');
}

function childSchema(schema: any): any {
  return schema?._def?.innerType || schema?._def?.schema || schema?._def?.type || schema;
}

function shapeOf(schema: any): Record<string, any> {
  const shape = schema?._def?.shape;
  if (typeof shape === 'function') return shape();
  return shape || {};
}

function compactIssue(error: any) {
  const issues = Array.isArray(error?.issues) ? error.issues : [];
  if (!issues.length) return String(error?.message || error || 'Schema validation failed').slice(0, 700);
  return issues
    .slice(0, 8)
    .map((issue: any) => {
      const path = Array.isArray(issue.path) && issue.path.length ? issue.path.join('.') : 'root';
      return `${path}: ${issue.message || 'invalid value'}`;
    })
    .join('; ')
    .slice(0, 900);
}

function describeZod(schema: any, depth = 0): string {
  if (!schema || depth > 3) return 'any';
  const typeName = zodTypeName(schema);

  if (['ZodDefault', 'ZodOptional', 'ZodNullable', 'ZodEffects', 'ZodCatch'].includes(typeName)) {
    return describeZod(childSchema(schema), depth);
  }

  if (typeName === 'ZodString') return 'string';
  if (typeName === 'ZodNumber') return 'number';
  if (typeName === 'ZodBoolean') return 'boolean';
  if (typeName === 'ZodAny' || typeName === 'ZodUnknown') return 'any';
  if (typeName === 'ZodEnum') return `one of: ${(schema._def?.values || []).join(' | ')}`;
  if (typeName === 'ZodLiteral') return JSON.stringify(schema._def?.value);
  if (typeName === 'ZodArray') return `array of ${describeZod(schema._def?.type, depth + 1)}`;
  if (typeName === 'ZodUnion') {
    return (schema._def?.options || []).map((item: any) => describeZod(item, depth + 1)).join(' or ');
  }

  if (typeName === 'ZodObject') {
    const entries = Object.entries(shapeOf(schema)).slice(0, 30);
    const body = entries.map(([key, value]) => `${key}: ${describeZod(value, depth + 1)}`).join(', ');
    return `{ ${body} }`;
  }

  return typeName.replace(/^Zod/, '').toLowerCase();
}

export function buildJsonReliabilityInstruction(schema: unknown) {
  const contract = describeZod(schema);
  return [
    'JSON reliability contract:',
    '- Return exactly one JSON object or JSON array. No markdown, no prose, no trailing commentary.',
    '- Use double quotes for all keys and strings.',
    '- If evidence is missing, use empty strings, empty arrays, false, 0, or "low" confidence instead of inventing facts.',
    '- Keep arrays short and atomic; avoid nested explanations unless the schema requires them.',
    schema ? `- Shape to satisfy: ${contract}` : '',
  ].filter(Boolean).join('\n');
}

export function validateJsonAgainstSchema<T = unknown>(schema: unknown, value: unknown): T {
  const candidate = schema as SchemaLike | undefined;
  if (!candidate) return value as T;

  if (typeof candidate.safeParse === 'function') {
    const result = candidate.safeParse(value);
    if (result.success) return result.data as T;
    throw new Error(`JSON schema validation failed: ${compactIssue(result.error)}`);
  }

  if (typeof candidate.parse === 'function') {
    try {
      return candidate.parse(value) as T;
    } catch (error) {
      throw new Error(`JSON schema validation failed: ${compactIssue(error)}`);
    }
  }

  return value as T;
}

export function isJsonReliabilityError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /json|schema|validation|parse|unexpected token|unterminated|stringify/i.test(message);
}
