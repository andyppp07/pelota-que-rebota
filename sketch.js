/*
Pelotita Loca.
- Fondo oscuro para que contrasten la pelota y las figuras.
- La pelota rebota por los cuatro bordes; en cada rebote cambia de tamano,
  de direccion y de color, y tiene un patron de circulitos.
- Cada rebote toca una nota; la secuencia forma una melodia (escala pentatonica).
- Emite el sonido con p5.sound (oscilador + envelope), a volumen alto.
- Sistema de particulas: al hacer clic/arrastrar salen figuras variadas
  (corazon, flor, fantasma, vampiro y espada) desde la posicion del mouse.
  Las figuras siguen al mouse, usan colores acordes al de la pelota,
  viven 10 segundos y rebotan en los bordes.
- La pelota se detiene mientras el cursor esta encima de ella.
*/

let posX;
let posY;
let velX;
let velY;
let radio;

let colorPelota;

const FONDO = [16, 18, 31]; // azul muy oscuro, contrasta con los colores vivos

const GRAVEDAD = 0.55;
const VEL_MAX = 30;
const REBOTE_MIN = 11;
const RADIO_MIN = 14;
const RADIO_MAX = 46;

// Escala pentatonica (Do mayor) para la melodia.
const ESCALA = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];
let notaIndex = 0;

// Particulas: las figuras se pre-renderizan en buffers (p5.Graphics) y luego se
// dibujan muy rapido con drawingContext.drawImage() por particula.
const MAX_PARTICULAS = 260;
const VIDA_PARTICULA = 10000; // 10 segundos
const NUM_PALETAS = 4;
const TAM_FIGURA = 72;
const VEL_SEGUIR = 7;          // velocidad con la que persiguen al mouse
const SUAVIZADO = 0.08;        // que tan rapido corrigen su rumbo
const VEL_PARTICULA_MAX = 18;
const DIST_EMISION = 12;       // px que debe avanzar el mouse para soltar una figura
let particulas = [];
let formas = [];   // formas[tipo][paleta] = p5.Graphics
let paletas = [];

let osc;
let env;
let audioListo = false;
let ratonEnPantalla = false;
let ratonPrevX = null;
let ratonPrevY = null;
let acumuladorEmision = 0;

function setup() {
  createCanvas(windowWidth, windowHeight);

  radio = random(RADIO_MIN, RADIO_MAX);
  colorPelota = color(random(80, 255), random(80, 255), random(80, 255));
  posX = width / 2;
  posY = height / 3;
  velX = random(-4, 4);
  velY = 0;

  construirFormas();

  // Sonido: oscilador enrutado por un envelope, para notas cortas y fuertes.
  osc = new p5.Oscillator('triangle');
  osc.disconnect();
  osc.amp(0.9);
  env = new p5.Envelope();
  env.setADSR(0.01, 0.08, 0.18, 0.2);
  osc.connect(env);

  // El audio necesita un gesto del usuario; lo activamos con cualquier clic.
  window.addEventListener('pointerdown', activarAudio);

  // Saber si el mouse esta sobre la pantalla (sin necesidad de hacer clic).
  window.addEventListener('pointermove', () => { ratonEnPantalla = true; });
  document.addEventListener('mouseleave', () => { ratonEnPantalla = false; });

  textAlign(CENTER);
  textSize(14);
}

function draw() {
  background(FONDO[0], FONDO[1], FONDO[2]);

  const sobrePelota = dist(mouseX, mouseY, posX, posY) <= radio;

  if (!sobrePelota) {
    moverPelota();
  }

  // Las figuras van saliendo a medida que el mouse avanza por la pantalla.
  emitirPorMovimiento();

  actualizarParticulas();
  dibujarParticulas();

  if (!audioListo) {
    fill(255);
    noStroke();
    text('Mueve el mouse para lanzar figuras y haz clic para el sonido', width / 2, height - 20);
  }

  dibujarPelota();
}

function dibujarPelota() {
  // Base
  noStroke();
  fill(colorPelota);
  circle(posX, posY, radio * 2);

  // Patron de circulitos (un tono oscuro del color de la pelota).
  fill(red(colorPelota) * 0.3, green(colorPelota) * 0.3, blue(colorPelota) * 0.3, 220);
  circle(posX, posY, radio * 0.5); // punto central

  const anillo = 6;
  const orbita = radio * 0.58;
  const tamPunto = radio * 0.34;
  for (let i = 0; i < anillo; i++) {
    const ang = (TWO_PI / anillo) * i;
    circle(posX + cos(ang) * orbita, posY + sin(ang) * orbita, tamPunto);
  }
}

function moverPelota() {
  posX += velX;
  posY += velY;
  velY += GRAVEDAD;

  let reboteIzq = false;
  let reboteDer = false;
  let reboteArriba = false;
  let reboteAbajo = false;

  // Borde izquierdo
  if (posX - radio < 0 && velX < 0) {
    posX = radio;
    velX = energiaRebote(velX);
    reboteIzq = true;
  }
  // Borde derecho
  else if (posX + radio > width && velX > 0) {
    posX = width - radio;
    velX = -energiaRebote(velX);
    reboteDer = true;
  }

  // Borde superior
  if (posY - radio < 0 && velY < 0) {
    posY = radio;
    velY = energiaRebote(velY);
    reboteArriba = true;
  }
  // Borde inferior
  else if (posY + radio > height && velY > 0) {
    posY = height - radio;
    velY = -energiaRebote(velY);
    reboteAbajo = true;
  }

  if (reboteIzq || reboteDer || reboteArriba || reboteAbajo) {
    cambiarAspecto();

    // Garantiza que la pelota salga hacia adentro de la pantalla.
    if (reboteIzq) velX = abs(velX);
    if (reboteDer) velX = -abs(velX);
    if (reboteArriba) velY = abs(velY);
    if (reboteAbajo) velY = -abs(velY);

    sonar();
  }

  velX = constrain(velX, -VEL_MAX, VEL_MAX);
  velY = constrain(velY, -VEL_MAX, VEL_MAX);
}

// Magnitud aleatoria de la velocidad tras rebotar: fuerte, pero nunca por
// debajo de REBOTE_MIN (asi la pelota no se apaga).
function energiaRebote(v) {
  let magnitud = abs(v) * random(0.8, 1.08);
  if (magnitud < REBOTE_MIN) magnitud = random(REBOTE_MIN, REBOTE_MIN * 2);
  return min(magnitud, VEL_MAX);
}

// En cada rebote la pelota cambia de tamano, color y direccion.
function cambiarAspecto() {
  const radioMax = max(RADIO_MIN, min(RADIO_MAX, width / 2 - 4, height / 2 - 4));
  radio = random(RADIO_MIN, radioMax);
  colorPelota = color(random(80, 255), random(80, 255), random(80, 255));

  // Las figuras se recolorean acordes al nuevo color de la pelota.
  repintarFormas();

  // Gira el vector de velocidad un angulo aleatorio (nueva direccion).
  const ang = random(-0.9, 0.9);
  const nuevoX = velX * cos(ang) - velY * sin(ang);
  const nuevoY = velX * sin(ang) + velY * cos(ang);
  velX = nuevoX;
  velY = nuevoY;

  // Mantiene la pelota dentro del canvas con su nuevo tamano.
  posX = constrain(posX, radio, width - radio);
  posY = constrain(posY, radio, height - radio);
}

// Cada rebote toca la siguiente nota de la melodia (escala pentatonica).
function sonar() {
  if (!audioListo || !env) return;

  notaIndex = (notaIndex + floor(random(1, 3))) % ESCALA.length;
  let frecuencia = ESCALA[notaIndex];
  if (random() < 0.25) frecuencia *= 2; // a veces una octava mas arriba

  osc.freq(frecuencia);
  osc.amp(0.9, 0.02); // volumen alto
  env.play();
}

// ---------------------------------------------------------------------------
// Sistema de particulas
// ---------------------------------------------------------------------------

class Particula {
  constructor(x, y) {
    this.x = x;
    this.y = y;

    const ang = random(TWO_PI);
    const velocidad = random(1.5, 5);
    this.vx = cos(ang) * velocidad;
    this.vy = sin(ang) * velocidad - random(1, 4); // sesgo hacia arriba

    this.tipo = floor(random(5)); // 0 corazon, 1 flor, 2 fantasma, 3 vampiro, 4 espada
    this.paleta = floor(random(NUM_PALETAS));
    this.tamano = random(18, 40);
    this.rot = random(TWO_PI);
    this.velRot = random(-0.08, 0.08);

    this.nacimiento = millis();
  }

  edad() {
    return millis() - this.nacimiento;
  }

  viva() {
    return this.edad() < VIDA_PARTICULA;
  }

  alfa() {
    const restante = VIDA_PARTICULA - this.edad();
    if (restante >= 2000) return 255;
    return constrain(map(restante, 0, 2000, 0, 255), 0, 255);
  }

  actualizar() {
    // Persigue al mouse: velocidad deseada hacia el cursor, frenando al acercarse.
    const dx = mouseX - this.x;
    const dy = mouseY - this.y;
    const d = sqrt(dx * dx + dy * dy) + 0.0001;

    const objetivo = min(VEL_SEGUIR, d * 0.12);
    const deseadoVX = (dx / d) * objetivo;
    const deseadoVY = (dy / d) * objetivo;

    this.vx += (deseadoVX - this.vx) * SUAVIZADO;
    this.vy += (deseadoVY - this.vy) * SUAVIZADO;

    // Un poco de desorden para que no se amontonen en un solo punto.
    this.vx += random(-0.15, 0.15);
    this.vy += random(-0.15, 0.15);

    // Tope de velocidad.
    const rapidez = sqrt(this.vx * this.vx + this.vy * this.vy);
    if (rapidez > VEL_PARTICULA_MAX) {
      this.vx = (this.vx / rapidez) * VEL_PARTICULA_MAX;
      this.vy = (this.vy / rapidez) * VEL_PARTICULA_MAX;
    }

    this.x += this.vx;
    this.y += this.vy;
    this.rot += this.velRot;

    // Rebote en los bordes.
    if (this.x < 0) { this.x = 0; this.vx = abs(this.vx) * 0.8; }
    else if (this.x > width) { this.x = width; this.vx = -abs(this.vx) * 0.8; }
    if (this.y < 0) { this.y = 0; this.vy = abs(this.vy) * 0.8; }
    else if (this.y > height) { this.y = height; this.vy = -abs(this.vy) * 0.8; }
  }

  dibujar() {
    // Dibujado directo sobre el contexto del canvas: mucho mas rapido que
    // push()/image() de p5 por cada particula.
    const ctx = drawingContext;
    const g = formas[this.tipo][this.paleta];
    const mitad = this.tamano / 2;

    ctx.save();
    ctx.globalAlpha = this.alfa() / 255;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.drawImage(g.canvas, -mitad, -mitad, this.tamano, this.tamano);
    ctx.restore();
  }
}

function emitirParticulas(x, y, cantidad) {
  for (let i = 0; i < cantidad && particulas.length < MAX_PARTICULAS; i++) {
    particulas.push(new Particula(x, y));
  }
}

// Suelta una figura por cada DIST_EMISION px que recorre el mouse. Si el mouse
// esta quieto no emite nada; si sale de la pantalla se reinicia el rastro.
function emitirPorMovimiento() {
  if (!ratonEnPantalla) {
    ratonPrevX = null;
    return;
  }

  if (ratonPrevX !== null) {
    acumuladorEmision += dist(mouseX, mouseY, ratonPrevX, ratonPrevY);
    while (acumuladorEmision >= DIST_EMISION) {
      acumuladorEmision -= DIST_EMISION;
      if (particulas.length < MAX_PARTICULAS) {
        emitirParticulas(mouseX, mouseY, 1);
      }
    }
  }

  ratonPrevX = mouseX;
  ratonPrevY = mouseY;
}

function actualizarParticulas() {
  for (let i = particulas.length - 1; i >= 0; i--) {
    particulas[i].actualizar();
    if (!particulas[i].viva()) {
      particulas.splice(i, 1);
    }
  }
}

function dibujarParticulas() {
  for (const p of particulas) {
    p.dibujar();
  }
}

// ---------------------------------------------------------------------------
// Figuras pre-renderizadas (colores acordes al de la pelota)
// ---------------------------------------------------------------------------

function construirFormas() {
  formas = [];
  for (let tipo = 0; tipo < 5; tipo++) {
    const variantes = [];
    for (let pal = 0; pal < NUM_PALETAS; pal++) {
      variantes.push(createGraphics(TAM_FIGURA, TAM_FIGURA));
    }
    formas.push(variantes);
  }
  repintarFormas();
}

// Vuelve a pintar los buffers con paletas derivadas del color de la pelota.
function repintarFormas() {
  paletas = [];
  for (let i = 0; i < NUM_PALETAS; i++) {
    const acento = color(random(255), random(255), random(255));
    paletas.push(lerpColor(colorPelota, acento, 0.22));
  }

  for (let tipo = 0; tipo < 5; tipo++) {
    for (let pal = 0; pal < NUM_PALETAS; pal++) {
      const g = formas[tipo][pal];
      g.clear();
      g.push();
      g.translate(TAM_FIGURA / 2, TAM_FIGURA / 2);
      pintarForma(g, tipo, TAM_FIGURA * 0.92, paletas[pal]);
      g.pop();
    }
  }
}

function pintarForma(g, tipo, s, col) {
  switch (tipo) {
    case 0: pintarCorazon(g, s, col); break;
    case 1: pintarFlor(g, s, col); break;
    case 2: pintarFantasma(g, s, col); break;
    case 3: pintarVampiro(g, s, col); break;
    default: pintarEspada(g, s, col); break;
  }
}

function pintarCorazon(g, s, col) {
  g.noStroke();
  g.fill(col);
  g.circle(-s * 0.19, -s * 0.12, s * 0.52);
  g.circle(s * 0.19, -s * 0.12, s * 0.52);
  g.triangle(-s * 0.43, -s * 0.02, s * 0.43, -s * 0.02, 0, s * 0.45);
}

function pintarFlor(g, s, col) {
  g.noStroke();
  g.fill(col);
  const petalos = 6;
  for (let i = 0; i < petalos; i++) {
    g.push();
    g.rotate((TWO_PI / petalos) * i);
    g.ellipse(0, -s * 0.26, s * 0.32, s * 0.5);
    g.pop();
  }
  g.fill(255, 225, 80);
  g.circle(0, 0, s * 0.34);
}

function pintarFantasma(g, s, col) {
  g.noStroke();
  g.fill(col);
  g.ellipse(0, -s * 0.02, s * 0.72, s * 0.92);
  g.circle(-s * 0.22, s * 0.3, s * 0.26);
  g.circle(0, s * 0.36, s * 0.26);
  g.circle(s * 0.22, s * 0.3, s * 0.26);
  g.fill(30);
  g.circle(-s * 0.13, -s * 0.06, s * 0.15);
  g.circle(s * 0.13, -s * 0.06, s * 0.15);
}

function pintarVampiro(g, s, col) {
  g.noStroke();
  // capa
  g.fill(140, 0, 45);
  g.triangle(-s * 0.45, s * 0.45, s * 0.45, s * 0.45, 0, -s * 0.15);
  // cara
  g.fill(col);
  g.circle(0, -s * 0.05, s * 0.62);
  // pelo puntiagudo
  g.fill(25, 25, 35);
  g.triangle(-s * 0.31, -s * 0.2, -s * 0.12, -s * 0.55, 0, -s * 0.22);
  g.triangle(0, -s * 0.24, s * 0.12, -s * 0.55, s * 0.31, -s * 0.2);
  // ojos
  g.fill(235, 30, 30);
  g.circle(-s * 0.13, -s * 0.06, s * 0.12);
  g.circle(s * 0.13, -s * 0.06, s * 0.12);
  // colmillos
  g.fill(255);
  g.triangle(-s * 0.1, s * 0.08, -s * 0.035, s * 0.08, -s * 0.068, s * 0.24);
  g.triangle(s * 0.035, s * 0.08, s * 0.1, s * 0.08, s * 0.068, s * 0.24);
}

function pintarEspada(g, s, col) {
  g.noStroke();
  // hoja
  g.fill(225, 230, 240);
  g.quad(0, -s * 0.55, s * 0.1, -s * 0.4, s * 0.1, s * 0.08, -s * 0.1, s * 0.08);
  // guarda
  g.fill(col);
  g.rectMode(CENTER);
  g.rect(0, s * 0.13, s * 0.52, s * 0.1, s * 0.04);
  // mango
  g.fill(95, 60, 30);
  g.rect(0, s * 0.32, s * 0.13, s * 0.3, s * 0.05);
  // pomo
  g.fill(235, 205, 85);
  g.circle(0, s * 0.5, s * 0.13);
}

// El navegador solo permite audio tras un gesto del usuario.
function activarAudio() {
  try {
    userStartAudio();
    if (!audioListo && osc) {
      osc.start();
      audioListo = true;
    }
  } catch (e) {
    console.warn('No se pudo iniciar el audio:', e);
  }
}

function mousePressed() {
  activarAudio();
}

function touchStarted() {
  activarAudio();
  emitirParticulas(mouseX, mouseY, 14);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
