import path from "path";
import fs from "fs";
import { Project, Type, ts } from "ts-morph";

const projectCache = new Map<string, Project>();

/**
 * Generates a mock object based on a TypeScript type name defined in the current project.
 *
 * @param typeName - The name of the TypeScript type to mock (interface, type alias, enum, or exported type).
 * @param overrides - Optional object specifying values to override in the generated mock.
 *
 * @returns A mock object matching the specified type with default values filled in and overrides applied.
 *
 * @throws Error if the specified type is not found in the project’s source files.
 */
export function generateMock(typeName: string, overrides: Record<string, any> = {}): any {
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

  const mock = mockFromType(foundType);
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

function isMapOrSet(type: Type<ts.Type>): "Map" | "Set" | null {
  const symbolName = type.getSymbol()?.getName();
  if (symbolName === "Map" || symbolName === "Set") return symbolName;
  return null;
}

function mockFromType(type: Type<ts.Type>, seen: Set<string> = new Set()): any {
  if (type.isString()) return "example";
  if (type.isNumber()) return 42;
  if (type.isBoolean()) return true;
  if (type.getText() === "Date") return new Date();

  if (type.isEnumLiteral() || type.isEnum()) {
    const members = type.isUnion() ? type.getUnionTypes() : [type];
    const first = members[0];
    return first.getLiteralValue() ?? 0;
  }

  if (type.isTuple()) {
    return type.getTupleElements().map((elementType) => mockFromType(elementType, seen));
  }

  if (type.isArray()) {
    const elementType = type.getArrayElementTypeOrThrow();
    return [mockFromType(elementType, seen)];
  }

  const mapOrSet = isMapOrSet(type);
  if (mapOrSet === "Map") return new Map();
  if (mapOrSet === "Set") return new Set();

  if (type.isUnion()) {
    const unionTypes = type.getUnionTypes();
    const meaningful = unionTypes.filter((t) => !t.isUndefined() && !t.isNull());
    const candidates = meaningful.length > 0 ? meaningful : unionTypes;

    const literalMember = candidates.find((t) => t.getLiteralValue() !== undefined);
    if (literalMember) return literalMember.getLiteralValue();

    if (candidates.length > 0) return mockFromType(candidates[0], seen);
    return undefined;
  }

  if (type.getCallSignatures().length > 0) {
    return () => undefined;
  }

  if (type.isObject()) {
    const typeKey = type.getText();
    if (seen.has(typeKey)) return null;

    const nextSeen = new Set(seen);
    nextSeen.add(typeKey);

    const properties = type.getProperties();
    const mock: Record<string, any> = {};

    for (const prop of properties) {
      const declaration = prop.getValueDeclaration();
      if (!declaration) {
        mock[prop.getName()] = null;
        continue;
      }

      const propType = prop.getTypeAtLocation(declaration);
      mock[prop.getName()] = mockFromType(propType, nextSeen);
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
