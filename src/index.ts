import path from "path";
import fs from "fs";
import { Project, Type, ts } from "ts-morph";

interface ProjectCacheEntry {
  project: Project;
  typeIndex: Map<string, () => Type>;
}
const projectCache = new Map<string, ProjectCacheEntry>();
const tsconfigCache = new Map<string, string | null>();

export interface MockOptions {
  /**
   * Number of synthetic entries to populate for open `Record<string, V>` / index-signature
   * types (which have no declared key names to go on). Default `0` (mocks to `{}`).
   */
  sampleRecordEntries?: number;
}

interface MockContext {
  seen: Set<ts.Type>;
  options: MockOptions;
}

function buildTypeIndex(project: Project): Map<string, () => Type> {
  const index = new Map<string, () => Type>();
  for (const sf of project.getSourceFiles()) {
    for (const decl of [...sf.getTypeAliases(), ...sf.getInterfaces(), ...sf.getEnums()]) {
      const name = decl.getName();
      if (!index.has(name)) index.set(name, () => decl.getType());
    }
    for (const exportSymbol of sf.getExportSymbols()) {
      const name = exportSymbol.getName();
      if (!index.has(name)) index.set(name, () => exportSymbol.getDeclaredType());
    }
  }
  return index;
}

/**
 * Generates a mock object based on a TypeScript type name defined in the current project.
 *
 * @param typeName - The name of the TypeScript type to mock (interface, type alias, enum, or exported type).
 * @param overrides - Optional object specifying values to override in the generated mock.
 * @param options - Optional settings controlling how certain types are mocked.
 *
 * @returns A mock object matching the specified type with default values filled in and overrides applied.
 *
 * @throws Error if the specified type is not found in the project’s source files.
 */
export function generateMock(
  typeName: string,
  overrides: Record<string, any> = {},
  options: MockOptions = {}
): any {
  const tsconfigPath = findTsConfig(process.cwd()) || path.resolve("./tsconfig.json");

  let entry = projectCache.get(tsconfigPath);
  if (!entry) {
    const project = new Project({
      tsConfigFilePath: tsconfigPath,
      skipAddingFilesFromTsConfig: false,
    });
    entry = { project, typeIndex: buildTypeIndex(project) };
    projectCache.set(tsconfigPath, entry);
  }

  const foundType = entry.typeIndex.get(typeName)?.();

  if (!foundType) {
    throw new Error(`Type ${typeName} not found in project`);
  }

  const mock = mockFromType(foundType, { seen: new Set(), options });
  return deepMerge(mock, overrides);
}

function findTsConfig(startDir: string): string | null {
  const cwd = path.resolve(startDir);
  if (tsconfigCache.has(cwd)) return tsconfigCache.get(cwd)!;

  let currentDir = cwd;
  let result: string | null = null;

  while (true) {
    const tsconfigPath = path.join(currentDir, "tsconfig.json");
    if (fs.existsSync(tsconfigPath)) {
      result = tsconfigPath;
      break;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  tsconfigCache.set(cwd, result);
  return result;
}

const WELL_KNOWN_WRAPPERS = new Set(["Map", "Set", "ReadonlyMap", "ReadonlySet", "Promise"]);

function getWellKnownWrapperName(type: Type<ts.Type>): string | null {
  const symbolName = type.getSymbol()?.getName();
  return symbolName && WELL_KNOWN_WRAPPERS.has(symbolName) ? symbolName : null;
}

function mockFromType(type: Type<ts.Type>, ctx: MockContext): any {
  if (type.isString()) return "example";
  if (type.isNumber()) return 42;
  if (type.isBoolean()) return true;
  if (type.isBigInt()) return BigInt(42);
  if (type.getText() === "Date") return new Date();
  if (type.getText() === "RegExp") return /example/;

  if (type.isEnumLiteral() || type.isEnum()) {
    const members = type.isUnion() ? type.getUnionTypes() : [type];
    const first = members[0];
    return first.getLiteralValue() ?? 0;
  }

  if (type.isTuple()) {
    return type.getTupleElements().map((elementType) => mockFromType(elementType, ctx));
  }

  if (type.isArray() || type.isReadonlyArray()) {
    const elementType = type.getArrayElementTypeOrThrow();
    return [mockFromType(elementType, ctx)];
  }

  const wrapperName = getWellKnownWrapperName(type);
  if (wrapperName === "Map" || wrapperName === "ReadonlyMap") return new Map();
  if (wrapperName === "Set" || wrapperName === "ReadonlySet") return new Set();
  if (wrapperName === "Promise") {
    const innerType = type.getTypeArguments()[0];
    return Promise.resolve(innerType ? mockFromType(innerType, ctx) : undefined);
  }

  if (type.isUnion()) {
    const unionTypes = type.getUnionTypes();
    const meaningful = unionTypes.filter((t) => !t.isUndefined() && !t.isNull());
    const candidates = meaningful.length > 0 ? meaningful : unionTypes;

    const literalMember = candidates.find((t) => t.getLiteralValue() !== undefined);
    if (literalMember) return literalMember.getLiteralValue();

    if (candidates.length > 0) return mockFromType(candidates[0], ctx);
    return undefined;
  }

  if (type.getCallSignatures().length > 0) {
    return () => undefined;
  }

  if (type.isObject() || type.isIntersection()) {
    const typeKey = type.compilerType;
    if (ctx.seen.has(typeKey)) return null;

    ctx.seen.add(typeKey);
    try {
      const properties = type.getProperties();
      const mock: Record<string, any> = {};

      for (const prop of properties) {
        const declaration = prop.getValueDeclaration();
        if (!declaration) {
          mock[prop.getName()] = null;
          continue;
        }

        const propType = prop.getTypeAtLocation(declaration);
        mock[prop.getName()] = mockFromType(propType, ctx);
      }

      const sampleRecordEntries = ctx.options.sampleRecordEntries ?? 0;
      if (sampleRecordEntries > 0) {
        const stringIndexType = type.getStringIndexType();
        const numberIndexType = type.getNumberIndexType();

        if (stringIndexType) {
          for (let i = 1; i <= sampleRecordEntries; i++) {
            mock[`exampleKey${i}`] = mockFromType(stringIndexType, ctx);
          }
        } else if (numberIndexType) {
          for (let i = 0; i < sampleRecordEntries; i++) {
            mock[i] = mockFromType(numberIndexType, ctx);
          }
        }
      }

      return mock;
    } finally {
      ctx.seen.delete(typeKey);
    }
  }

  return null;
}


function isPlainObject(obj: any): boolean {
  return Object.prototype.toString.call(obj) === "[object Object]";
}

function deepMerge(target: any, source: any): any {
  if (typeof source !== "object" || source === null) return source;

  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = target[key];

    if (
      isPlainObject(srcVal) &&
      isPlainObject(tgtVal)
    ) {
      target[key] = deepMerge(tgtVal, srcVal);
    } else {
      target[key] = srcVal;
    }
  }

  return target;
}
