import * as Path from 'path';
import { URI } from 'vscode-uri'; // Corrigido


function substituteVariables(variable: string, workspacePath: string | undefined, filePath: string | undefined): string | undefined {
    switch(variable) {
        case 'workspaceRoot': return workspacePath;
        case 'workspaceRootFolderName': return workspacePath !== undefined ? Path.basename(workspacePath) : undefined;
        case 'file': return filePath;
        case 'relativeFile': return (workspacePath !== undefined && filePath !== undefined) ? Path.relative(workspacePath, filePath) : undefined;
        case 'fileBasename': return filePath !== undefined ? Path.basename(filePath) : undefined;
        case 'fileBasenameNoExtension':
            if(filePath === undefined) return undefined;

            const extIndex = filePath.lastIndexOf('.');
            if(extIndex > 0) {
                return Path.basename(filePath.substring(0, extIndex));
            }
            return Path.basename(filePath);
        case 'fileDirname': return filePath !== undefined ? Path.dirname(filePath) : undefined;
        case 'fileExtname': return filePath !== undefined ? Path.extname(filePath) : undefined;
        default: return undefined;
    }
}

export function resolvePathVariables(path: string, workspacePath: string | undefined, filePath: string | undefined): string {
    let index = 0;
    let finalPath = '';

    while(index < path.length) {
        if(path[index] === '$' && path[index + 1] === '{') {
            const startIndex = index;
            index += 2;
            const endIndex = path.indexOf('}', index);
            
            if (endIndex === -1) { // Não encontrou '}'
                finalPath += path.substring(startIndex);
                break;
            }

            const variableName = path.substring(index, endIndex).trim();
            const substitution = substituteVariables(variableName, workspacePath, filePath);

            if(substitution !== undefined) {
                finalPath += substitution;
            } else {
                finalPath += path.substring(startIndex, endIndex + 1); // Mantém a variável se não for resolvida
            }
            index = endIndex + 1;
        } else {
            finalPath += path[index++];
        }
    }

    return finalPath;
}