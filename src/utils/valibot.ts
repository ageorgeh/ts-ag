import type { GenericSchema, GenericSchemaAsync } from 'valibot';

export function isSchema(x: unknown): x is GenericSchema {
  return !!x && typeof x === 'object' && 'kind' in x && x['kind'] === 'schema';
}

export function unwrap(schema: GenericSchema): GenericSchema {
  // Unwrap common wrappers that simply contain another schema under `wrapped`
  // optional | exactOptional | undefinedable | nullable | nullish | nonNullable | nonNullish | readonly | brand | description | metadata | title | flavor
  // Most of these share `{ type: string; wrapped: GenericSchema }`
  // Guarded unwrap to avoid infinite loops.
  let curr: any = schema as any;
  const seen = new Set<any>();
  while (curr && typeof curr === 'object' && !seen.has(curr) && 'wrapped' in curr && isSchema((curr as any).wrapped)) {
    seen.add(curr);
    curr = (curr as any).wrapped;
  }
  return curr as GenericSchema;
}

function isIntegerKey(s: string): boolean {
  // allow "0", "01" etc. to index tuples/arrays consistently
  return /^-?\d+$/.test(s);
}

export type GetSchemaByPathOptions = {
  /**
   * When a union/variant cannot be narrowed by the path segment,
   * choose index `preferOption` (default 0). Set to -1 to return undefined instead.
   */
  preferOption?: number;
};

export function getSchemaByPath(
  root: GenericSchema | GenericSchemaAsync,
  path: string,
  opts: GetSchemaByPathOptions = {}
): GenericSchema | undefined {
  if (!isSchema(root)) return undefined;
  if (!path) return root;

  const keys = path.split('.');
  let curr: GenericSchema | undefined = root;

  for (let i = 0; i < keys.length; i++) {
    if (!curr) return undefined;
    curr = unwrap(curr);
    const seg = keys[i];

    // Narrow by schema "type"
    const type = (curr as any).type as string | undefined;

    switch (type) {
      case 'object': {
        // ObjectSchema has `.entries`
        const entries = (curr as any).entries as Record<string, GenericSchema> | undefined;
        if (!entries) return undefined;
        curr = entries[seg];
        break;
      }

      case 'record': {
        // RecordSchema has `.value` for any key
        const value = (curr as any).value as GenericSchema | undefined;
        curr = value;
        break;
      }

      case 'array': {
        // ArraySchema has `.item`
        if (!isIntegerKey(seg)) return undefined;
        const item = (curr as any).item as GenericSchema | undefined;
        curr = item;
        break;
      }

      case 'tuple': {
        // TupleSchema has `.items` and possibly `.rest`
        if (!isIntegerKey(seg)) return undefined;
        const idx = Number(seg);
        const items = (curr as any).items as GenericSchema[] | undefined;
        const rest = (curr as any).rest as GenericSchema | undefined;
        if (!items) return undefined;
        curr = idx < items.length ? items[idx] : rest;
        break;
      }

      case 'union': {
        // UnionSchema has `.options` (array of schemas)
        const options = (curr as any).options as GenericSchema[] | undefined;
        if (!options?.length) return undefined;

        // Try to narrow by segment:
        //  - if numeric seg: prefer array/tuple options
        //  - if string seg: prefer object/record options that contain seg
        const numeric = isIntegerKey(seg);

        let next: GenericSchema | undefined;

        if (numeric) {
          next =
            options.find((o) => {
              const u = unwrap(o) as any;
              return u?.type === 'array' || u?.type === 'tuple';
            }) ?? options[opts.preferOption ?? 0];
        } else {
          // Prefer object/record with matching key
          next =
            options.find((o) => {
              const u = unwrap(o) as any;
              if (u?.type === 'object') {
                const ent = u.entries as Record<string, GenericSchema> | undefined;
                return !!ent && seg in ent;
              }
              return u?.type === 'record';
            }) ?? options[opts.preferOption ?? 0];
        }

        curr = next;
        // Loop continues to use seg against selected option
        i--; // reprocess this segment against the chosen branch
        break;
      }

      case 'variant': {
        // Variant (discriminated union) has `.options` too
        const options = (curr as any).options as GenericSchema[] | undefined;
        if (!options?.length) return undefined;
        // Same narrowing as union
        const numeric = isIntegerKey(seg);
        let next: GenericSchema | undefined;
        if (numeric) {
          next =
            options.find((o) => {
              const u = unwrap(o) as any;
              return u?.type === 'array' || u?.type === 'tuple';
            }) ?? options[opts.preferOption ?? 0];
        } else {
          next =
            options.find((o) => {
              const u = unwrap(o) as any;
              if (u?.type === 'object') {
                const ent = u.entries as Record<string, GenericSchema> | undefined;
                return !!ent && seg in ent;
              }
              return u?.type === 'record';
            }) ?? options[opts.preferOption ?? 0];
        }
        curr = next;
        i--;
        break;
      }

      default: {
        // If it’s a pipeline schema (`pipe`) or similar wrapper, many expose `.wrapped` and are handled by unwrap.
        // If we end up at a primitive or unknown structure while keys remain, fail.
        return undefined;
      }
    }
  }

  return curr ? unwrap(curr) : undefined;
}
