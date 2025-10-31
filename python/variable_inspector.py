#!/usr/bin/env python3
"""
python/variable_inspector.py - Main backend entry point
Runs as a separate process to inspect Python variables
"""

import sys
import json
import io
from contextlib import redirect_stdout, redirect_stderr

from inspector import get_all_variables, get_variable_details

# Global namespace for executed code
exec_namespace = {}


def _inject_main_locals_capture(code):
    """
    Injects code to expose main() local variables after it's called.
    Uses AST transformation to add globals().update(locals()) at the end of main().
    """
    import ast
    import sys

    try:
        tree = ast.parse(code)

        # Find and modify main() function
        main_found = False
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef) and node.name == 'main':
                main_found = True
                # Add code to expose locals at the end of main()
                expose_stmt = ast.parse(
                    "globals().update({k: v for k, v in locals().items() if not k.startswith('_')})"
                ).body[0]
                node.body.append(expose_stmt)

        if not main_found:
            return code

        # Convert back to code using ast.unparse (Python 3.9+)
        if sys.version_info >= (3, 9):
            return ast.unparse(tree)
        else:
            # For older Python, just return original code
            return code

    except (SyntaxError, Exception):
        # If AST modification fails, return original code
        return code


def run_python_file(file_path, capture_main_locals=False):
    """Execute a Python file and capture variables

    Args:
        file_path: Path to the Python file to execute
        capture_main_locals: If True, expose local variables from main() function
    """
    global exec_namespace

    try:
        with open(file_path, 'r') as f:
            code = f.read()

        # Inject code to capture main() locals if enabled
        if capture_main_locals:
            code = _inject_main_locals_capture(code)

        # Set __name__ to '__main__' so if __name__ == '__main__' blocks execute
        exec_namespace['__name__'] = '__main__'
        exec_namespace['__file__'] = file_path

        # Capture stdout/stderr
        stdout_capture = io.StringIO()
        stderr_capture = io.StringIO()

        with redirect_stdout(stdout_capture), redirect_stderr(stderr_capture):
            exec(code, exec_namespace)

        # Get variables after execution
        variables = get_all_variables(exec_namespace)

        response = {
            'status': 'success',
            'variables': variables,
            'stdout': stdout_capture.getvalue(),
            'stderr': stderr_capture.getvalue()
        }

    except Exception as e:
        response = {
            'status': 'error',
            'error': str(e),
            'variables': []
        }

    return response


def run_python_code(code, capture_main_locals=False):
    """Execute Python code string and capture variables

    Args:
        code: Python code string to execute
        capture_main_locals: If True, expose local variables from main() function
    """
    global exec_namespace

    try:
        # Inject code to capture main() locals if enabled
        if capture_main_locals:
            code = _inject_main_locals_capture(code)

        stdout_capture = io.StringIO()
        stderr_capture = io.StringIO()

        with redirect_stdout(stdout_capture), redirect_stderr(stderr_capture):
            exec(code, exec_namespace)

        variables = get_all_variables(exec_namespace)

        response = {
            'status': 'success',
            'variables': variables,
            'stdout': stdout_capture.getvalue(),
            'stderr': stderr_capture.getvalue()
        }

    except Exception as e:
        response = {
            'status': 'error',
            'error': str(e),
            'variables': get_all_variables(exec_namespace)
        }

    return response

def update_variable(var_name, var_type, new_value):
    """Update a variable value in the execution namespace"""
    global exec_namespace

    if var_name not in exec_namespace:
        return {'status': 'error', 'error': f'Variable {var_name} not found'}

    try:
        # Convert the string value to the appropriate type
        type_lower = var_type.lower()

        if type_lower == 'bool':
            # Handle boolean conversion
            if new_value.lower() in ('true', '1', 'yes'):
                converted_value = True
            elif new_value.lower() in ('false', '0', 'no'):
                converted_value = False
            else:
                return {'status': 'error', 'error': f'Invalid boolean value: {new_value}'}

        elif type_lower in ('int', 'int8', 'int16', 'int32', 'int64', 'uint8', 'uint16', 'uint32', 'uint64'):
            converted_value = int(new_value)

        elif type_lower in ('float', 'float16', 'float32', 'float64'):
            converted_value = float(new_value)

        elif type_lower == 'complex':
            converted_value = complex(new_value)

        elif type_lower == 'str':
            converted_value = new_value

        else:
            return {'status': 'error', 'error': f'Type {var_type} is not editable'}

        # Update the variable
        exec_namespace[var_name] = converted_value

        # Return updated variables list
        from inspector import get_all_variables
        variables = get_all_variables(exec_namespace)
        return {'status': 'success', 'variables': variables}

    except (ValueError, SyntaxError) as e:
        return {'status': 'error', 'error': f'Invalid value for type {var_type}: {str(e)}'}


def clear_namespace():
    """Clear all variables from the execution namespace"""
    global exec_namespace

    # Keep built-in variables but clear user-defined ones
    keys_to_delete = [key for key in exec_namespace.keys() if not key.startswith('_')]
    for key in keys_to_delete:
        del exec_namespace[key]

    return {'status': 'success', 'message': 'Namespace cleared', 'variables': []}


def main():
    """Main loop to process commands from VS Code"""
    sys.stderr.write("Variable Inspector Backend Started\n")
    sys.stderr.flush()
    
    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break
            
            command = json.loads(line.strip())
            
            if command['command'] == 'run_file':
                capture_main = command.get('capture_main_locals', False)
                response = run_python_file(command['file'], capture_main)
                print(json.dumps(response), flush=True)

            elif command['command'] == 'run_code':
                capture_main = command.get('capture_main_locals', False)
                response = run_python_code(command['code'], capture_main)
                print(json.dumps(response), flush=True)
                
            elif command['command'] == 'get_variables':
                variables = get_all_variables(exec_namespace)
                response = {'variables': variables}
                print(json.dumps(response), flush=True)
                
            elif command['command'] == 'get_details':
                path = command.get('path', None)
                details = get_variable_details(command['name'], exec_namespace, path)
                print(json.dumps(details), flush=True)

            elif command['command'] == 'update_variable':
                response = update_variable(command['name'], command['type'], command['value'])
                print(json.dumps(response), flush=True)

            elif command['command'] == 'clear_namespace':
                response = clear_namespace()
                print(json.dumps(response), flush=True)
                
        except Exception as e:
            error_response = {
                'status': 'error',
                'error': str(e)
            }
            print(json.dumps(error_response), flush=True)

if __name__ == '__main__':
    main()