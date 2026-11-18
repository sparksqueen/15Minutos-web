# 15 Minutos

Versión web de la rama `main` de [sparksqueen/15Minutos](https://github.com/sparksqueen/15Minutos/tree/380c2e424f59f376604f0339137884d51f0e2c14).

## Jugar

Extraé toda la carpeta y abrí `index.html` en un navegador de escritorio. Los archivos funcionan en conjunto, incluida la carpeta `assets`.

| Control | Acción |
| --- | --- |
| Flechas o WASD | Caminar |
| Espacio | Limpiar o eliminar el objeto cercano |
| G, mantener y soltar | Agarrar, llevar y dejar un objeto |
| Botones del HUD | Abrir Mapa, Pendientes o Ajustes |

Elegí uno de los tres niveles después de pulsar **JUGAR**. El reloj baja de 15:00 a 00:00 en cinco minutos reales. Entrá a Créditos desde el menú principal y usá Volver o Esc para salir.
 
Para arrancar directamente en Casa y probar el flujo del TP, abrí `demo.html`. Acercate al primer objeto desplazable para activar el tutorial. El reloj sigue corriendo mientras consultás Mapa, Pendientes o Ajustes.


## Código

- `index.html` carga el juego. `styles.css` define la presentación de la interfaz.
- `scene.js` contiene los datos de las escenas, los objetos, las animaciones y la interfaz.
- `game.js` controla la partida, la cámara, el audio, los objetos y las transiciones.
- `geometry.js` resuelve las colisiones y las zonas de interacción.

Los sprites, las pantallas, la música y la fuente se extrajeron del proyecto original. Los fotogramas más pesados de las intros están en WebP. La física 2D se adaptó a Canvas y JavaScript.
