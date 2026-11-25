import path from "path";
import fs from "fs";
import { Project, Type, ts } from "ts-morph";

const projectCache = new Map<string, Project>();

export interface MockOptions {
  /**
   * Number of synthetic entries to populate for open `Record<string, V>` / index-signature
   * types (which have no declared key names to go on). Default `0` (mocks to `{}`).
   */
  sampleRecordEntries?: number;
}

interface MockContext {
  seen: Set<string>;
  options: MockOptions;
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

  let project = projectCache.get(tsconfigPath);
  if (!project) {
    project = new Project({
      tsConfigFilePath: tsconfigPath,
      skipAddingFilesFromTsConfig: false,
    });
    projectCache.set(tsconfigPath, project);
  }

  const sourceFiles = project.getSourceFiles();
  let foundType: Type | undefined;

  for (const sf of sourceFiles) {
    const namedDeclaration = sf.getTypeAlias(typeName) || sf.getInterface(typeName) || sf.getEnum(typeName);
    if (namedDeclaration) {
      foundType = namedDeclaration.getType();
      break;
    }

    for (const exportSymbol of sf.getExportSymbols()) {
      if (exportSymbol.getName() === typeName) {
        foundType = exportSymbol.getDeclaredType();
        break;
      }
    }

    if (foundType) break;
  }

  if (!foundType) {
    throw new Error(`Type ${typeName} not found in project`);
  }

  const mock = mockFromType(foundType, { seen: new Set(), options });
  return deepMerge(mock, overrides);
}

function findTsConfig(startDir: string): string | null {
  let currentDir = path.resolve(startDir);

  while (true) {
    const tsconfigPath = path.join(currentDir, "tsconfig.json");
    if (fs.existsSync(tsconfigPath)) return tsconfigPath;

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  return null;
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
    const typeKey = type.getText();
    if (ctx.seen.has(typeKey)) return null;

    const nextCtx: MockContext = { seen: new Set(ctx.seen), options: ctx.options };
    nextCtx.seen.add(typeKey);

    const properties = type.getProperties();
    const mock: Record<string, any> = {};

    for (const prop of properties) {
      const declaration = prop.getValueDeclaration();
      if (!declaration) {
        mock[prop.getName()] = null;
        continue;
      }

      const propType = prop.getTypeAtLocation(declaration);
      mock[prop.getName()] = mockFromType(propType, nextCtx);
    }

    const sampleRecordEntries = ctx.options.sampleRecordEntries ?? 0;
    if (sampleRecordEntries > 0) {
      const stringIndexType = type.getStringIndexType();
      const numberIndexType = type.getNumberIndexType();

      if (stringIndexType) {
        for (let i = 1; i <= sampleRecordEntries; i++) {
          mock[`exampleKey${i}`] = mockFromType(stringIndexType, nextCtx);
        }
      } else if (numberIndexType) {
        for (let i = 0; i < sampleRecordEntries; i++) {
          mock[i] = mockFromType(numberIndexType, nextCtx);
        }
      }
    }

    return mock;
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
