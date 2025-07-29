import path from "path";
import fs from "fs";
import { Project, Type, ts } from "ts-morph";

/**
 * Generates a mock object based on a TypeScript type name defined in the current project.
 * 
 * @param typeName - The name of the TypeScript type to mock (interface, type alias, or exported type).
 * @param overrides - Optional object specifying values to override in the generated mock.
 * 
 * @returns A mock object matching the specified type with default values filled in and overrides applied.
 * 
 * @throws Error if the specified type is not found in the project’s source files.
 */
export function generateMock(typeName: string, overrides: Record<string, any> = {}): any {
  const tsconfigPath = findTsConfig(process.cwd()) || path.resolve("./tsconfig.json");

  const project = new Project({
    tsConfigFilePath: tsconfigPath,
    skipAddingFilesFromTsConfig: false,
  });

  const sourceFiles = project.getSourceFiles();
  let foundType: Type | undefined;

  for (const sf of sourceFiles) {
    const typeAlias = sf.getTypeAlias(typeName) || sf.getInterface(typeName);
    if (typeAlias) {
      foundType = typeAlias.getType();
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

function mockFromType(type: Type<ts.Type>): any {
  if (type.isString()) return "example";
  if (type.isNumber()) return 42;
  if (type.isBoolean()) return true;
  if (type.getText() === "Date") return new Date();

  const unionTypes = type.isUnion() ? type.getUnionTypes() : [];
  if (unionTypes.length > 0) {
    return unionTypes[0].getLiteralValue();
  }

  if (type.isObject()) {
    const properties = type.getProperties();
    const mock: Record<string, any> = {};

    for (const prop of properties) {
      const propType = prop.getTypeAtLocation(prop.getValueDeclarationOrThrow());
      mock[prop.getName()] = mockFromType(propType);
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
