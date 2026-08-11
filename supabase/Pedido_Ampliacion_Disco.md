**Para:** [Nombre]
**De:** Martin Wolcan
**Asunto:** Necesito ampliar el disco del servidor de Web Interna SP

Hola [Nombre],

Te escribo porque me trabé con el servidor donde estamos instalando la nueva intranet (Web Interna SP) y llegué a un límite de disco que no se resuelve limpiando, hace falta ampliarlo.

Contexto breve: para el proyecto de autenticación y roles que veníamos hablando, estoy instalando Supabase (base de datos + login) de forma autoalojada sobre Coolify, que ya está corriendo en el servidor. El disco actual tiene 9.7GB en total, y Coolify solo ya usa más de la mitad. Al intentar desplegar el stack de Supabase (son 8 servicios: base de datos, gateway de API, autenticación, almacenamiento, panel de administración, etc.) el disco se llenó a mitad de la descarga de las imágenes y tiró abajo tanto el Redis como la base de datos interna de Coolify — tuve que reinstalar Supabase una vez ya por esto, y el problema se repitió en el segundo intento.

No es un tema de limpieza: ya liberamos espacio corriendo `docker system prune` y sigue sin alcanzar. El disco directamente se quedó chico para lo que necesita correr ahí.

**Lo que pido:** ampliar el disco de este servidor (extender la partición o agregar un volumen, lo que sea más simple de tu lado). Con que quede en unos 30-40GB en total debería alcanzar con margen para el stack de Supabase completo más lo que vayamos guardando ahí (contenidos, archivos de usuarios, backups) a futuro.

Avisame si necesitás algún dato más del servidor para hacerlo — lo tengo todo a mano.

Gracias,
Martin
