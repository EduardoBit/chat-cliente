import { useState, useEffect, type FormEvent, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import './App.css';
import Avatar from './Avatar';
import EmojiPicker, { type EmojiClickData } from 'emoji-picker-react';

const formatTimestamp = (timestamp?: string): string => {
  if (!timestamp) return '';
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString(navigator.language, {
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch (error) {
    console.error("Error al formatear la fecha:", error);
    return '';
  }
};

interface MessagePayload {
  id: number;
  usuario: string;
  usuario_id?: number;
  texto?: string | null;
  imagen_url?: string | null;
  timestamp?: string;
  estado: string;
  sala_id: number;
}

interface SalaDbEntry {
  id: number;
  nombre: string;
  nombre_sistema?: string;
  no_leidos?: number;
  ultimo_mensaje_fecha?: string;
  ultimo_mensaje_texto?: string;
  ultimo_mensaje_usuario_id?: number;
}

interface AuthUser {
  id: number;
  username: string;
  token: string;
}

interface Notificacion {
  id: number;
  texto: string;
}

const API_URL = '';

function App() {

  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [mostrarEmojiPicker, setMostrarEmojiPicker] = useState(false);

  // Reemplaza a 'enLobby' y 'salaActual' (string)
  const [salaActual, setSalaActual] = useState<SalaDbEntry | null>(null);
  const authUserRef = useRef(authUser);
  const salaActualRef = useRef(salaActual);

  const [misSalas, setMisSalas] = useState<SalaDbEntry[]>([]);
  const [salasPublicas, setSalasPublicas] = useState<SalaDbEntry[]>([]);
  const [nuevaSala, setNuevaSala] = useState(''); // Input para crear sala
  const [wallpaper, setWallpaper] = useState<string>('#e5ddd5');
  const [isUploading, setIsUploading] = useState(false);

  // Estados del Chat
  const [mensajeActual, setMensajeActual] = useState('');
  const [mensajes, setMensajes] = useState<MessagePayload[]>([]);
  const [typingDisplay, setTypingDisplay] = useState('');
  const [usuariosConectados, setUsuariosConectados] = useState<string[]>([]);
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]); // (Esta la arreglaremos luego)
  interface UserEntry { id: number; username: string; }
  const [usuariosGlobales, setUsuariosGlobales] = useState<UserEntry[]>([]);

  // Refs
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<number | null>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wallpaperInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
  authUserRef.current = authUser;
  salaActualRef.current = salaActual;
}, [authUser, salaActual]);

// useEffect para manejar la conexión del socket
  useEffect(() => {
    if (!authUser) return;

    // enviamos el token
    const newSocket = io(API_URL, {
      auth: {
        token: authUser.token
      }
    });

    newSocket.on('connect', () => {
      console.log('Socket conectado exitosamente.', newSocket.id);
      setSocket(newSocket);
      newSocket.emit('solicitarMisSalas', (salas: SalaDbEntry[]) => {
        setMisSalas(salas);
      });

      newSocket.emit('solicitarSalasPublicas', (salas: SalaDbEntry[]) => {
        setSalasPublicas(salas);
      });

      newSocket.emit('solicitarListaUsuarios', (usuarios: UserEntry[]) => {
    setUsuariosGlobales(usuarios);
      });
    });

    newSocket.on('connect_error', (err) => {
      console.error('Error de conexión de socket:', err.message);
      // Aquí podríamos manejar un token inválido, borrando el authUser
      // y forzando el login de nuevo.
    });

    return () => {
      newSocket.disconnect();
    };
  }, [authUser]);

  useEffect(() => {
  const savedWallpaper = localStorage.getItem('chatWallpaper');
  if (savedWallpaper) {
    setWallpaper(savedWallpaper); // Simplemente establece el estado
  }
}, []);

  //useEffect para Sockets
useEffect(() => {
  if (!socket) return;

  socket.on('receiveMessage', (nuevoPayload: MessagePayload) => {

      const usuarioActual = authUserRef.current;
      const salaAbierta = salaActualRef.current;

      // --- DEBUG LOGS (Míralos en la consola) ---
      console.log("RECV MSG:", nuevoPayload);
      console.log("YO SOY:", usuarioActual);

      const idMiUsuario = Number(usuarioActual?.id);
      const idAutorMensaje = Number(nuevoPayload.usuario_id);

      // Comparación EXPLICITA
      const soyElAutor = idMiUsuario === idAutorMensaje;
      console.log(`COMPARANDO IDs: ${idMiUsuario} === ${idAutorMensaje} ? ${soyElAutor}`);

      const idSalaAbierta = salaAbierta ? String(salaAbierta.id) : null;
      const idSalaMensaje = String(nuevoPayload.sala_id);
      const estoyEnEstaSala = idSalaAbierta === idSalaMensaje;

      // 1. Actualizar Chat
      if (estoyEnEstaSala) {
          setMensajes(prev => [...prev, nuevoPayload]);
          if (!soyElAutor) {
             marcarMensajesComoLeidos([nuevoPayload], salaAbierta?.id);
          }
      }

      // 2. Actualizar Lobby
      setMisSalas(prevSalas => {
        const salaIndex = prevSalas.findIndex(s => String(s.id) === idSalaMensaje);

        if (salaIndex === -1) return prevSalas;

        const salaActualizada = { ...prevSalas[salaIndex] };

        // --- LÓGICA ---
        if (soyElAutor) {
            console.log("--> Soy el autor. Contador a 0.");
            salaActualizada.no_leidos = 0;
        } else if (estoyEnEstaSala) {
            console.log("--> Estoy en la sala. Contador a 0.");
            salaActualizada.no_leidos = 0;
        } else {
            console.log("--> Mensaje nuevo. Sumando +1.");
            salaActualizada.no_leidos = (salaActualizada.no_leidos || 0) + 1;
        }
        // -------------

        salaActualizada.ultimo_mensaje_texto = nuevoPayload.imagen_url ? "📷 Foto" : (nuevoPayload.texto || "");
        salaActualizada.ultimo_mensaje_fecha = new Date().toISOString();
        salaActualizada.ultimo_mensaje_usuario_id = Number(nuevoPayload.usuario_id); // Guardamos esto por si acaso

        const nuevasSalas = [...prevSalas];
        nuevasSalas.splice(salaIndex, 1);
        nuevasSalas.unshift(salaActualizada);

        return nuevasSalas;
      });
    });




  // Otros listeners (sin cambios lógicos, los mantenemos)
  const handleAlguienEscribe = (usuario: string) => {
    setTypingDisplay(`${usuario} está escribiendo...`);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => setTypingDisplay(''), 2000);
  };

  const handleActualizarListaUsuarios = (lista: string[]) => setUsuariosConectados(lista);

  const handleNotificacion = (texto: string) => {
    const nuevaNoti = { id: Date.now(), texto };
    setNotificaciones(prev => [...prev, nuevaNoti]);
    setTimeout(() => setNotificaciones(prev => prev.filter(n => n.id !== nuevaNoti.id)), 5000);
  };

  const handleActualizarEstados = (payload: { messageIds: number[]; nuevoEstado: string }) => {
    setMensajes(prevMensajes =>
      prevMensajes.map(msg =>
        payload.messageIds.includes(msg.id) ? { ...msg, estado: payload.nuevoEstado } : msg
      )
    );
  };

  // Registro
  socket.on('alguienEscribe', handleAlguienEscribe);
  socket.on('actualizarListaUsuarios', handleActualizarListaUsuarios);
  socket.on('notificacion', handleNotificacion);
  socket.on('actualizarEstados', handleActualizarEstados);

  // Limpieza: pasar las mismas referencias a off()
  return () => {
    socket.off('receiveMessage');
    socket.off('alguienEscribe', handleAlguienEscribe);
    socket.off('actualizarListaUsuarios', handleActualizarListaUsuarios);
    socket.off('notificacion', handleNotificacion);
    socket.off('actualizarEstados', handleActualizarEstados);
  };
}, [socket]);


  useEffect(() => {
   const handleClickOutside = (event: MouseEvent) => {
      if (
        mostrarEmojiPicker &&
          // Ahora usamos las referencias, que son instantáneas
        emojiButtonRef.current &&
       !emojiButtonRef.current.contains(event.target as Node) &&
        emojiPickerRef.current &&
       !emojiPickerRef.current.contains(event.target as Node)
    ) {
       setMostrarEmojiPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
     document.removeEventListener('mousedown', handleClickOutside);
   };
  }, [mostrarEmojiPicker]);


  // useEffect para Auto-Scroll
  useEffect(() => {
    if (chatContainerRef.current) {
      const chatContainer = chatContainerRef.current;
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }, [mensajes]);


  //handleSubmit
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!socket || mensajeActual.trim() === '') return;
    // (Esta lógica fallará, la arreglaremos luego)
    socket.emit('sendMessage', { texto: mensajeActual });
    setMensajeActual('');
  };


  const handleUnirseASala = (salaObj: SalaDbEntry) => {
    if (!socket) return;
    setMensajes([]);
    setNotificaciones([]);

    setMisSalas(prevSalas => prevSalas.map(s =>
      s.id === salaObj.id ? { ...s, no_leidos: 0 } : s
    ));

    // 1. Determinamos el nombre técnico para el socket.
    //    Si tiene 'nombre_sistema' (es privada), usamos ese. Si no, usamos 'nombre'.
    const nombreParaSocket = salaObj.nombre_sistema || salaObj.nombre;

    socket.emit('unirseASala', nombreParaSocket, () => {
      // 2. ¡TRUCO! Guardamos en el estado el objeto 'salaObj' que vino del click.
      //    Este objeto tiene el nombre correcto (ej: "Juan") y no el técnico.
      setSalaActual(salaObj);

      // 3. Cargamos el historial usando el ID de la sala
      socket.emit('solicitarHistorial', salaObj.id, (historial: MessagePayload[]) => {
        setMensajes(historial);
        marcarMensajesComoLeidos(historial, salaObj.id);
      });
    });
  };

  // Función para enviar los IDs de mensajes leídos al servidor
const marcarMensajesComoLeidos = (mensajesRecibidos: MessagePayload[], salaId: number | undefined) => {
  if (!socket || !authUser || !salaId) return;

  const idsDeMensajesNoLeidos = mensajesRecibidos
  .filter(msg =>
    Number(msg.usuario_id) !== Number(authUser.id) &&
    msg.estado !== 'leido'
  )
  .map(msg => msg.id);

  if (idsDeMensajesNoLeidos.length > 0) {
    socket.emit('marcarComoLeido', {
      salaId: salaId,
      messageIds: idsDeMensajesNoLeidos
    });
  }
};

  const handleIniciarChatPrivado = (otroUsuarioId: number) => {
  if (!socket) return;
  setMensajes([]);
  setNotificaciones([]);

  // Usamos el nuevo evento del backend
  socket.emit('solicitarChatPrivado', otroUsuarioId, (salaInfo: SalaDbEntry) => {
    // El backend nos devuelve la sala (nueva o existente) y el nombre del otro usuario
    setSalaActual(salaInfo);

    // El historial funciona igual que antes
    socket.emit('solicitarHistorial', salaInfo.id, (historial: MessagePayload[]) => {
      setMensajes(historial);
      marcarMensajesComoLeidos(historial, salaInfo.id);
    });
  });
};

  const handleCrearSala = (e: FormEvent) => {
    e.preventDefault();
    if (!socket || nuevaSala.trim() === '') return;

    //Enviamos el nombre escrito (string) al backend
    socket.emit('unirseASala', nuevaSala, (salaInfoBackend: SalaDbEntry) => {
      //El backend crea/busca la sala y nos devuelve el OBJETO con el ID
      setSalaActual(salaInfoBackend);
      //Ahora que tenemos el ID que nos dio el backend, pedimos el historial
      socket.emit('solicitarHistorial', salaInfoBackend.id, (historial: MessagePayload[]) => {
        setMensajes(historial);
        marcarMensajesComoLeidos(historial, salaInfoBackend.id);
      });
    });

    setNuevaSala(''); // Limpiamos el input
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0];
  if (!file || !socket || !authUser) return;

  setIsUploading(true);

  try {
    //Poner el archivo en un FormData
    const formData = new FormData();
    formData.append('file', file);

    // Subirlo a nuestro backend
    const response = await fetch(`${API_URL}/api/upload`, {
      method: 'POST',
      headers: {
        // Adjuntamos el token de autenticación
        'Authorization': `Bearer ${authUser.token}`
      },
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.mensaje || 'Error al subir');
    }

    //Enviar el mensaje de socket con la URL
    socket.emit('sendMessage', {
      texto: null,
      imagen_url: data.url // La URL de Cloudinary
    });

  } catch (error) {
    console.error('Error al subir:', error);
    alert('Error al subir la imagen.');
  } finally {
    setIsUploading(false);
  }
};

const handleWallpaperUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0];
  if (!file || !authUser) return;

  // Mostrar un indicador de carga
  alert("Subiendo fondo...");

  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_URL}/api/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authUser.token}`
      },
      body: formData
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.mensaje || 'Error al subir');
    }

    // Llama a tu función existente con la nueva URL
    handleSetWallpaper(`url(${data.url})`);

  } catch (error) {
    console.error('Error al subir fondo:', error);
    alert('Error al subir el fondo.');
  }
};

  const handleDejarSala = () => {
    if (!socket) return;
    socket.emit('dejarSala');
    setSalaActual(null);
    socket.emit('solicitarMisSalas', (salas: SalaDbEntry[]) => setMisSalas(salas));
    socket.emit('solicitarSalasPublicas', (salas: SalaDbEntry[]) => setSalasPublicas(salas));
  };

  const handleLogout = () => {
    setAuthUser(null);
    setSocket(null); // Esto dispara la desconexión
    localStorage.removeItem('token'); // Borramos el token
  };

  const handleSetWallpaper = (bgValue: string) => {
    setWallpaper(bgValue);
    localStorage.setItem('chatWallpaper', bgValue);
  };

  // --- Renderizado de Login---
  if (!authUser) {
    return <AuthForm setAuthUser={setAuthUser} />;
  }

  if (authUser && !salaActual) {
    return (
      <div className="lobby-container">
        <header className="lobby-header">
          <h2>Chats</h2>
          <p>Hola, {authUser.username}</p>
          <button onClick={handleLogout} className="btn-logout">Cerrar Sesión</button>
        </header>

        <form onSubmit={handleCrearSala} className="crear-sala-form">
          <input
            type="text"
            value={nuevaSala}
            onChange={(e) => setNuevaSala(e.target.value)}
            placeholder="Inicia o crea una nueva sala..."
          />
          <button type="submit">Crear</button>
        </form>

        <div className="lobby-listas">
          <div className="lista-seccion">
            <h3>Mis Salas</h3>
            <ul className="lista-salas">
              {misSalas.length === 0 && (
                <li className="sala-item-empty">Aún no te has unido a ninguna sala.</li>
              )}
              {misSalas.map(s => (
                <li key={s.id} className="sala-item" onClick={() => handleUnirseASala(s)}>
                  <Avatar username={s.nombre} />
                  <div className="sala-info">
                    <div className="sala-header-row">
                      <span className="sala-nombre">{s.nombre}</span>
                      {/* Hora del último mensaje (Opcional) */}
                      {s.ultimo_mensaje_fecha && (
                        <span className="sala-hora">
                          {new Date(s.ultimo_mensaje_fecha).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                      )}
                    </div>

                    <div className="sala-preview-row">
                      <span className="sala-ultimo-mensaje">
                        {s.ultimo_mensaje_texto || "No hay mensajes"}
                      </span>

                      {/* --- EL CÍRCULO VERDE --- */}
                      {s.no_leidos && s.no_leidos > 0 && s.ultimo_mensaje_usuario_id !== authUser?.id ? (
                        <span className="badge-no-leidos">{s.no_leidos}</span>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="lista-seccion">
            <h3>Salas Públicas</h3>
            <ul className="lista-salas">
              {salasPublicas.length === 0 && <li className="sala-item-empty">No hay salas públicas activas.</li>}
              {salasPublicas.map(s => (
                !misSalas.find(miSala => miSala.id === s.id) && (
                  <li key={s.id} className="sala-item" onClick={() => handleUnirseASala(s)}>
                    <Avatar username={s.nombre} />
                    <div className="sala-info"><span className="sala-nombre"># {s.nombre}</span></div>
                  </li>
                )
              ))}
            </ul>
          </div>

          <div className="lista-seccion">
            <h3>Usuarios</h3>
            <ul className="lista-salas">
              {usuariosGlobales.length === 0 && <li className="sala-item-empty">No hay otros usuarios conectados.</li>}
              {usuariosGlobales.map(user => (
                <li key={user.id} className="sala-item" onClick={() => handleIniciarChatPrivado(user.id)}>
                  <Avatar username={user.username} />
                  <div className="sala-info">
                    <span className="sala-nombre">{user.username}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  if (authUser && salaActual) {
    return (
      <div className="App">
        <aside className="sidebar-usuarios">
          <h3>En Línea ({usuariosConectados.length})</h3>
          <ul>
            {usuariosConectados.map((user) => (
              <li key={user}>
                <Avatar username={user} />
                <span>{user}</span>
              </li>
            ))}
          </ul>
        </aside>

        <main className="chat-area">
          <header>
            <button onClick={handleDejarSala} className="btn-salir">
              ←
            </button>
            <Avatar username={salaActual.nombre} />
            <div className="header-info">
              <h3>{salaActual.nombre}</h3>
            </div>

            <div className="settings-menu">
              <button className="btn-settings">⋮</button>
              <div className="settings-dropdown">
                <span>Cambiar Fondo</span>
                <div className="wallpaper-options">
                  <button
                    className="wp-option"
                    style={{ backgroundImage: `url('/fondochat.jpg')` }}
                    onClick={() => handleSetWallpaper('url(/fondochat.jpg)')}
                  ></button>
                  <button
                    className="wp-option"
                    style={{ backgroundImage: `url('/fondochat2.jpg')` }}
                    onClick={() => handleSetWallpaper('url(/fondochat2.jpg)')}
                  ></button>
                  <button
                    className="wp-option"
                    style={{ backgroundImage: `url('/fondochat3.jpg')` }}
                    onClick={() => handleSetWallpaper('url(/fondochat3.jpg)')}
                  ></button>
                  <button
                    className="wp-option wp-upload-btn"
                    onClick={() => wallpaperInputRef.current?.click()}
                  >
                    +
                  </button>
                </div>
              </div>
              <input
                type="file"
                ref={wallpaperInputRef}
                onChange={handleWallpaperUpload}
                style={{ display: 'none' }}
                accept="image/*"
              />
            </div>
          </header>

          <div className="notificaciones-area">
            {notificaciones.map(noti => (
              <div key={noti.id} className="notificacion">
                {noti.texto}
              </div>
            ))}
          </div>

          <div className="lista-mensajes" ref={chatContainerRef} style={{
    backgroundColor: wallpaper.startsWith('#') ? wallpaper : 'transparent',
    backgroundImage: wallpaper.startsWith('url(') ? wallpaper : 'none'
  }}>
            {mensajes.map((msg) => (
              <div
                key={msg.id}
                className={`mensaje-fila ${msg.usuario === authUser!.username ? 'mio' : 'otro'}`}
              >
                <Avatar username={msg.usuario} />
                <div className="mensaje-burbuja">
                  {msg.usuario !== authUser!.username && (
                    <strong>{msg.usuario}:</strong>
                  )}
                  {msg.imagen_url ? (
                    <img src={msg.imagen_url} alt="Imagen adjunta" className="chat-imagen" />
                  ) : (
                    <span className="mensaje-texto">{msg.texto}</span>
                  )}
                  <div className="mensaje-meta">
                    <span className="timestamp">
                      {formatTimestamp(msg.timestamp)}
                    </span>
                    {msg.usuario === authUser!.username && (
                      <span className={`ticks ticks-${msg.estado}`}>
                        {msg.estado === 'leido' ? '✓✓' : '✓'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="formulario-chat">
            <button
                type="button"
                className="btn-emoji-toggle"
                onClick={() => setMostrarEmojiPicker(prev => !prev)}
                aria-label="Abrir selector de emojis"
                ref={emojiButtonRef}
             >😊</button>
             <button
                type="button"
                className="btn-attach"
                onClick={() => fileInputRef.current?.click()} // Abre el input oculto
                disabled={isUploading} // Deshabilita mientras sube
              >
                📎
              </button>
              {/* Input de archivo oculto */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                style={{ display: 'none' }}
                accept="image/*,video/*" // Acepta imágenes y videos
              />

              {isUploading ? (
                <input type="text" placeholder="Subiendo imagen..." disabled />
              ) : (
                <input
                  type="text"
                  value={mensajeActual}
                  onChange={(e) => setMensajeActual(e.target.value)}
                  placeholder="Escribe tu mensaje..."
                />
              )}
              <button type="submit" disabled={isUploading}>▶</button>
            {mostrarEmojiPicker && (
              <div className="emoji-picker-contenedor">
                <EmojiPicker
                  onEmojiClick={(emojiData: EmojiClickData) => {
                    // Añade el emoji al mensaje actual
                    setMensajeActual(prev => prev + emojiData.emoji);
                    // Opcional: cierra el picker después de seleccionar
                    setMostrarEmojiPicker(false);
                  }}
                  skinTonesDisabled={true}
                />
              </div>
            )}
          </form>

          <div className="typing-indicator">
            {typingDisplay}
          </div>
        </main>
      </div>
    );
  }

  return null;
}

interface AuthFormProps {
  setAuthUser: (user: AuthUser) => void;
}

const AuthForm: React.FC<AuthFormProps> = ({ setAuthUser }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const url = isRegistering ? `${API_URL}/api/registrar` : `${API_URL}/api/login`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.mensaje || 'Algo salió mal');
      }

      if (isRegistering) {
        // Si se registra, que se loguee
        setError('¡Registro exitoso! Ahora inicia sesión.');
        setIsRegistering(false);
      } else {
        // Si se loguea
        const { token, username, userId } = data;
        const user: AuthUser = { id: userId, username, token };

        localStorage.setItem('token', token); // Guardamos el token
        setAuthUser(user); // Pasamos el usuario al componente App
      }

    } catch (err: any) {
      setError(err.message);
    }
  };

  // --- Renderizado del Chat ---
  return (
    <div className="login-form">
      <form onSubmit={handleSubmit}>
        <h2>{isRegistering ? 'Registrarse' : 'Iniciar Sesión'}</h2>
        {error && <p className="auth-error">{error}</p>}
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Nombre de usuario"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña"
          required
        />
        <button type="submit">{isRegistering ? 'Registrarse' : 'Entrar'}</button>
        <button
          type="button"
          className="btn-toggle-auth"
          onClick={() => { setIsRegistering(!isRegistering); setError(''); }}
        >
          {isRegistering ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'}
        </button>
      </form>
    </div>
  );
};

export default App;