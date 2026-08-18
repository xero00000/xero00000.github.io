const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function compileShader(gl, type, source, label) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Unknown shader compiler error';
    gl.deleteShader(shader);
    throw new Error(`${label} failed to compile:\n${message}`);
  }
  return shader;
}

function linkProgram(gl, vertexSource, fragmentSource, label) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource, `${label} vertex shader`);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource, `${label} fragment shader`);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'Unknown program linker error';
    gl.deleteProgram(program);
    throw new Error(`${label} failed to link:\n${message}`);
  }
  return program;
}

function makeUniformTable(gl, program) {
  const table = new Map();
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let index = 0; index < count; index += 1) {
    const info = gl.getActiveUniform(program, index);
    if (!info) continue;
    const name = info.name.replace(/\[0\]$/, '');
    table.set(name, { location: gl.getUniformLocation(program, name), type: info.type, size: info.size });
  }
  return table;
}

function setUniform(gl, table, name, value) {
  const uniform = table.get(name);
  if (!uniform || uniform.location === null || value === undefined) return;
  const { location, type } = uniform;
  switch (type) {
    case gl.FLOAT: gl.uniform1f(location, Number(value)); break;
    case gl.FLOAT_VEC2: gl.uniform2fv(location, value); break;
    case gl.FLOAT_VEC3: gl.uniform3fv(location, value); break;
    case gl.FLOAT_VEC4: gl.uniform4fv(location, value); break;
    case gl.INT:
    case gl.BOOL:
    case gl.SAMPLER_2D: gl.uniform1i(location, Number(value)); break;
    case gl.INT_VEC2:
    case gl.BOOL_VEC2: gl.uniform2iv(location, value); break;
    case gl.INT_VEC3:
    case gl.BOOL_VEC3: gl.uniform3iv(location, value); break;
    case gl.INT_VEC4:
    case gl.BOOL_VEC4: gl.uniform4iv(location, value); break;
    default: break;
  }
}

function setUniforms(gl, table, values) {
  for (const [name, value] of Object.entries(values)) setUniform(gl, table, name, value);
}

function createTexture(gl, width = 2, height = 2, data = null) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  return texture;
}

function allocateTexture(gl, texture, width, height) {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
}

export { clamp, compileShader, linkProgram, makeUniformTable, setUniforms, createTexture, allocateTexture };
