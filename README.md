<p align="center"><a href="https://matterai.com.ar"><img src="logo.png" alt="MatterAI" height="80"></a></p>

# MatterAI Escenas

[![HACS](https://img.shields.io/badge/HACS-repositorio%20personalizado-41BDF5.svg)](https://hacs.xyz/docs/faq/custom_repositories/)
[![Validar](https://github.com/giannovello7/matterai-escenas/actions/workflows/validate.yaml/badge.svg)](https://github.com/giannovello7/matterai-escenas/actions/workflows/validate.yaml)
![Licencia](https://img.shields.io/badge/licencia-MIT-blue)

Escenas y automatizaciones fáciles para **usuarios no administradores** de Home Assistant, con una experiencia tipo Tuya / eWeLink pero con todo el motor de HA por detrás.

## Por qué existe

Los usuarios no admin no pueden entrar al editor de automatizaciones de HA. Esta integración trae su propio motor y expone comandos websocket que **cualquier usuario** puede usar. Ese motor usa los mismos triggers, condiciones y scripts nativos de HA, y no toca `automations.yaml`. Para que un cliente no pueda romper nada, un usuario no admin sólo puede usar una lista blanca de dominios (luces, enchufes, persianas, clima, media, notificaciones, etc.). No puede usar `shell_command`, `hassio`, `homeassistant.restart`, eventos ni servicios dinámicos.

## Instalación

### Con HACS (recomendado: te avisa cuando hay versiones nuevas)

1. En Home Assistant: **HACS → ⋮ (arriba a la derecha) → Repositorios personalizados**.
2. Pegá `https://github.com/giannovello7/matterai-escenas`, elegí la categoría **Integración** y tocá **Agregar**.
3. Buscá **MatterAI Escenas** en HACS → **Descargar**.
4. Reiniciá Home Assistant.

[![Abrir en HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=giannovello7&repository=matterai-escenas&category=integration)

Para actualizar: cuando haya una versión nueva aparece en **Ajustes → Actualizaciones**. Tocás **Actualizar** y reiniciás.

### A mano

1. Copiá `custom_components/matterai_escenas` a `/config/custom_components/`.
2. Reiniciá Home Assistant.

### Después de instalar

1. **Ajustes → Dispositivos y servicios → Agregar integración → MatterAI Escenas.**
2. Listo: aparece **«Automatizaciones»** en la barra lateral para todos los usuarios, como el menú de escenas de Tuya o eWeLink. El nombre, el ícono o la opción de ocultarla se cambian en la integración → Configurar.
3. Opcional: también se puede agregar la tarjeta a un panel:

```yaml
type: custom:matterai-escenas-card
title: Automatizaciones      # opcional
mode: button                 # opcional: tarjeta chica que abre el menú a pantalla completa
icon: mdi:robot-happy-outline  # opcional (modo botón)
default_tab: scene           # scene | auto | timer (opcional)
allow_create: true           # false = sólo ejecutar/activar (opcional)
```

**Equipos visibles:** un administrador ve un engranaje ⚙ en la tarjeta o en el menú. Ahí elige qué equipos aparecen para armar automatizaciones, por tipo y con búsqueda. Lo que se desmarca no aparece en las listas del cliente.

La tarjeta se sirve sola desde la integración, así que no hace falta agregar un recurso de Lovelace. Después de actualizar, si no ves los cambios, forzá la recarga en el navegador o la app.

## Qué puede armar el cliente

**Escenas (tocar para ejecutar):** varias acciones con un toque. Cada escena crea un `button.*`, así que se puede poner en el panel o pedírsela a Alexa o Google.

**Automatizaciones: Si → Sólo si → Entonces**

| Si… (disparadores, cualquiera) | Sólo si… (todas / alguna) | Entonces… (en orden) |
|---|---|---|
| Un dispositivo cambia: puerta, movimiento, enchufe, persiana, cerradura…, con "durante X min" | Horario y días (puede cruzar medianoche) | Controlar un dispositivo: on/off, brillo, tono, color, posición, modo y temperatura del aire, volumen, opción, valor… |
| Un sensor supera o baja de un valor (temperatura, humedad, consumo…) | De día / de noche | "…y volver a apagar después de X min" |
| Horario + días de la semana | Estado de un dispositivo o valor de un sensor | Controlar un ambiente o toda la casa (apagar todas las luces del living) |
| Amanecer / atardecer con ± minutos | Hay alguien / no hay nadie / persona en casa o fuera | Activar escena o script de HA |
| Clima exterior: temperatura, humedad, viento, lluvia… | Modo de la alarma | Ejecutar, activar o pausar otra automatización |
| Llega el primero / se va el último / persona entra o sale de una zona | Época del año (del 1/12 al 6/1) | Notificación al celular o en HA |
| Alarma: se arma, se desarma o se dispara | | Decir algo por un parlante (TTS) |
| Botón o control remoto (tipo de pulsación) | | Esperar un tiempo |
| Cada X minutos u horas | | Esperar hasta que algo pase (con tiempo máximo) |
| Evento de calendario (con anticipación) | | |

Además, se puede elegir qué hacer si se vuelve a disparar mientras está en curso (reiniciar, ignorar, encolar o en paralelo). Cada automatización crea un `switch.*` para activarla o pausarla.

**Atajos de dispositivo** (lo que en Tuya o eWeLink está dentro del equipo):

- **Encender y apagar en un horario:** a una hora, o al amanecer o atardecer con offset, según los días.
- **Temporizador:** cuenta regresiva que se puede cancelar. Se puede guardar para reusarlo: queda en «Temporizadores» con un botón ▶ y crea un `button.*` en HA.
- **📺 Tele inteligente (Fire TV / Android TV por ADB):**
  - modo cine: se activa al darle play (en ciertas apps, de noche), con un toque en la tarjeta «Modo cine» de la pestaña Escenas, o las dos cosas;
  - cada luz con su intensidad y color (o blanco cálido/frío, o apagada); cierra persianas y opcionalmente activa otra escena; en pausa sube un poco y al terminar vuelve cada luz a su color y brillo;
  - equipos que acompañan a la tele (barra de sonido, LED);
  - tele prendida sin nadie: pausa y, si nadie vuelve, la apaga (detecta a alguien con mmWave o con movimiento + puerta, igual que el sensor del baño);
  - hora de dormir de los chicos, con bloqueo hasta la mañana;
  - volumen máximo de noche;
  - pausa automática con el timbre o la alarma.
- **🎟 Invitados (acceso por link):**
  - elegís qué pueden manejar (portón, cerradura, relé, botón, script) y cómo se llama cada uno en la página;
  - una invitación por persona con su tiempo: 1 hora, hoy, 3 días, fechas a elección o sin vencimiento; opcional sólo ciertos días y horario y una cantidad máxima de aperturas;
  - se comparte por WhatsApp; el invitado ve una página simple servida por Home Assistant (`/api/matterai_escenas/invitado/<token>`), sin usuario;
  - abrir el link no hace nada (la vista previa de WhatsApp no abre): hay que tocar el botón; un portón abierto no se «abre» de nuevo (un pulso de más lo cerraría) y hay 4 s entre toques;
  - aviso al celular en cada apertura con botón «Bloquear», y aviso si alguien prueba fuera de horario o con un link vencido; historial;
  - links falsos: después de 15 intentos en 10 minutos esa IP queda bloqueada un rato;
  - necesita que Home Assistant tenga dirección externa (Nabu Casa, dominio propio) o escribirla en la regla.
- **Alexa / Google por Matter:**
  - las escenas pueden crear un interruptor pulsador (`switch.<escena>`) que ejecuta la escena y vuelve a apagarse;
  - la Tele inteligente puede crear el interruptor «Modo cine» (prendido = modo cine activo; apagarlo restaura las luces);
  - se exponen con el add-on «Home Assistant Matter Hub»: «Alexa, prendé modo cine», o con una rutina de Alexa para decir sólo «modo cine».
- **Sensor de ocupación de un ambiente:** la lógica de «Luz por presencia» (movimiento + puerta + mmWave) sin luces. Crea un `binary_sensor` para usar en otras automatizaciones.
- **📹 Detección con cámaras (Frigate):** personas, autos, animales o paquetes en ciertas cámaras y zonas, con puntaje mínimo, horario o sólo de noche, sólo si no hay nadie o con la alarma armada, y merodeo (sólo si se queda X segundos). A las caras conocidas puede ignorarlas, avisar sin sonido o avisar igual. Avisa con foto y botones (Ver clip, Prender luces / Sirena, Silenciar 1 h), prende luces, hace sonar la sirena y anuncia en parlantes.
- **👤 Caras y patentes conocidas (Frigate):** cuando llega alguien de la familia o su auto (patentes con nombre: «AB123CD = Auto de Juan»), avisa, abre (con un botón o solo), desarma la alarma, prende luces si es de noche, da la bienvenida por parlante y ejecuta escenas. Guarda el registro de quién llegó.
  Frigate se escucha por MQTT (`frigate/events`): cámara, zonas, objeto, cara (sub_label) y patente. Si un evento no trae la cara, usa los sensores `*_last_recognized_face`. Las fotos y clips salen del proxy de notificaciones de la integración de Frigate. El portero también puede decir «Tocó el timbre: María».
- **Portero (Hikvision DS-KV6113 y otros IP):** cuando tocan llega un aviso que suena como llamada, con la foto y botones Abrir puerta / Abrir portón / Atender. Se repite mientras suena. Además anuncia en parlantes, prende la luz de entrada de noche, tiene horario de no molestar y avisa si no hay nadie en casa. «Atender» abre la pantalla del portero: video en vivo, hablar (con go2rtc + la tarjeta WebRTC Camera), abrir e historial de quién tocó (fotos en /media/matterai_portero, las últimas 30).
  Para integrar un Hikvision: add-on «Hikvision Doorbell» (estado de la llamada y botones de apertura por MQTT); en go2rtc, `rtsp://usuario:clave@IP:554/Streaming/Channels/101` + `isapi://usuario:clave@IP:80/` para el audio en los dos sentidos.
- **🔔 Recordatorios (pestaña propia):** recordatorios únicos o repetidos (diarios, algunos días, mensuales, anuales), con aviso y botones ✓ Hecho / En 1 hora / Mañana. Pueden insistir si no los marcás y ser urgentes. La pestaña muestra los pendientes, los próximos, la agenda de 7 días de los calendarios de HA y los hechos. **Avisos del calendario:** X minutos antes de cada evento y los de día completo a la mañana. **Por voz con Assist:** «recordame … mañana a las 9», «avisame en 20 minutos que …», «¿qué recordatorios tengo?»; la integración instala sola las frases en `custom_sentences/es/`.
- **Buenas noches:** escena con botón (también por voz) que apaga luces, teles y enchufes, deja luz de noche tenue, pone los aires para dormir, cierra persianas, echa llave, arma la alarma en modo noche y avisa qué quedó abierto. Además se activa sola: dentro de un horario, si en las áreas comunes no hay movimiento X minutos (los dormitorios no cuentan). Puede preguntar antes con botones; una vez por noche.
- **Clima inteligente:** horarios con temperatura (frío, calor o según la estación). Apaga si se abre una ventana y vuelve al cerrarla, apaga si no hay nadie, pasa a ahorro o apaga si la habitación queda vacía, no enfría ni calienta si afuera no hace falta, y respeta los cambios a mano hasta el próximo horario.
- **Despertador con luz:** a hora fija o con la alarma del celular. Si hay persianas y ya es de día, las abre de a poco sin prender luces (con sensor de lux como respaldo). Si no, hace un amanecer con las luces (intensidad y tono). Opcionalmente prende la calefacción antes y la música a la hora. Si apagás una luz, se corta.
- **Me voy / Llego:** se activa sola cuando se va el último (por la ubicación de la app) o al armar la alarma. Apaga luces, aires y enchufes, cierra persianas, echa llave, arma la alarma, activa otras automatizaciones y avisa qué quedó abierto. Si hubo movimiento reciente (alguien sin celular), espera y vuelve a fijarse. Al volver da la bienvenida: luces de noche, aire y desarma la alarma si se eligió.
- **Avisar si algo quedó abierto o prendido:** puertas, ventanas, portón, cerraduras, aires, calefacción y luces, con un tiempo por equipo. Se puede limitar a cuando no hay nadie o a la noche. El aviso al celular tiene botones (Apagar / cerrar, Recordar en 30 min, Ignorar), puede ser urgente, se repite y puede apagar / cerrar solo si nadie responde. El aviso se borra cuando se resuelve.
- **Luz por presencia (baños y ambientes):** usa movimiento, sensor de puerta («wasp in a box»: con la puerta cerrada y alguien adentro no se apaga) y presencia mmWave. Se configura cuándo prender (siempre, de noche o con poca luz), si prende al abrir la puerta, una intensidad tenue de madrugada, los tiempos de apagado, una liberación de seguridad, el bloqueo si alguien la apaga a mano y un extractor con demora, tiempo posterior y humedad. Crea un `binary_sensor` de ocupación. Antes de apagar baja la luz unos segundos como aviso (si te movés, vuelve a como estaba; al salir por la puerta apaga directo), y si se apagó sola y alguien se mueve enseguida la vuelve a prender aunque el sensor de luz todavía marque la claridad de la lámpara.
- **Luz circadiana / Brillo según la hora (dimmers):** se ajusta el tono, el brillo o los dos. La curva tiene 4 puntos (empieza a subir, máximo, empieza a bajar, mínimo): según el sol, con mañana y noche corridas y duración de cada transición; u horario fijo, con el mínimo hasta las 05:00. Tiene transición continua y respeta los cambios manuales hasta que se apague la luz. Las luces prendidas cambian de a poco, y al prender una se corrige al instante al tono que corresponde. No toca luces puestas en color por una escena. Con Philips Hue (u otras) por **Zigbee2MQTT** se puede dejar el tono listo con la luz apagada, sin destello al prender. La integración activa sola `execute_if_off` en cada lámpara, y un no-admin sólo puede publicar el tema `<base>/<ieee>/set/color_temp`.
- **Riego por zonas:** se puede usar bomba + electroválvulas, sólo válvulas o sólo bomba, con secuencia segura (nunca bombea contra válvulas cerradas). Tiene varios horarios (hora o sol), días de la semana o cada X días, temporada por meses y ajuste de tiempos en %. Se puede saltear por sensor de lluvia (y cortar si empieza a llover), por humedad del suelo de cada zona o por pronóstico (lluvia ahora, % o mm previstos, helada, viento). Avisa por qué no regó, tiene «Regar ahora» y apaga todo si HA se reinicia en medio de un riego.
- **Ciclo:** X min encendido / Y min apagado, todo el día o en una franja.
- **Simular presencia:** luces al azar desde que oscurece hasta una hora, para cuando están de viaje.

**Ideas listas:** luz con movimiento de noche, bienvenida a casa, apagar todo al salir, aviso de puerta abierta, alerta de agua o humo, persianas al atardecer, buenos días, aire si hace calor, apagado automático y modo cine.

## Instalador y cliente

La misma integración tiene dos «caras», según el usuario de Home Assistant:

- **Administrador (instalador):** ve todo, crea los **equipos del instalador** y entra a **⚙ Ajustes del instalador**. Si usás la integración MatterAI, todo esto está en su panel, en la pestaña **Automatizaciones**.
- **Cliente (usuario no administrador):** arma escenas, automatizaciones, temporizadores, recordatorios, rutinas e invitados. También usa y ajusta las automatizaciones inteligentes que armó el instalador.

Lo controla el servidor, no sólo la pantalla:

- **Equipos del instalador** (portón inteligente, sensor de ocupación de un ambiente): el cliente no los ve ni los puede cambiar, pausar o borrar. Sí usa lo que crean (el portón, el sensor).
- **🔒 Bloquear para el cliente:** cualquier automatización del instalador puede quedar con candado. El cliente la activa o la pausa, pero no la cambia ni la borra.
- **Qué puede crear el cliente:** en ⚙ el instalador elige, por casa, qué tipos de automatización puede crear el cliente.

### 🚪 Portón inteligente (instalador)

Crea un `cover` con estado real (**abierto, abriendo, cerrando, cerrado**) aunque el portón tenga un solo sensor de cerrado y un solo pulso para abrir y cerrar.

- Aprende solo cuánto tarda: mide desde que se manda cerrar hasta que el sensor marca cerrado. También se puede fijar a mano.
- Seguros:
  - no manda el pulso de cerrar mientras abre (lo frenaría);
  - abrir mientras cierra lo revierte;
  - detecta la apertura con el control remoto;
  - avisa cuando el cierre no terminó (se trabó o volvió por la fotocélula).
- Sirve con un relé de pulso (Shelly, Sonoff, botón, script) o con relés separados de abrir y cerrar. El sensor de abierto es opcional.
- Opcional: aviso si queda abierto más de X minutos (con botón «Cerrar») y cierre automático de noche.

## Servicios

- `matterai_escenas.run`: `rule_id` o `entity_id` (button o switch de la regla)
- `matterai_escenas.set_enabled`: `rule_id` o `entity_id` + `enabled`

## Dónde se guardan

En `/config/.storage/matterai_escenas.rules`. Cada regla guarda el modelo de la tarjeta (`ui`) y la configuración HA compilada (`triggers`, `conditions`, `actions`, `on_stop`). Un admin puede leerla ahí para depurar.

En la tarjeta, las automatizaciones prearmadas aparecen en la pestaña «Inteligentes», separadas de las que arma el cliente («Automáticas»).

Requiere Home Assistant 2024.11 o posterior.

## Licencia

Libre y gratis, bajo la [licencia MIT](LICENSE). El nombre y el logo de MatterAI son marcas: ver [NOTICE.md](NOTICE.md).

Hecho por **[MatterAI — Domótica & Automatismo](https://matterai.com.ar)**.
