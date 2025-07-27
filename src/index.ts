import { Project, Type } from "ts-morph";
import path from "path";
import { findTsConfig, mockFromType, deepMerge } from "./utils/utils";

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