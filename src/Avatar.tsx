import React from 'react';

// Definimos las propiedades que aceptará el componente
interface AvatarProps {
  username: string;
}

const Avatar: React.FC<AvatarProps> = ({ username }) => {
  // Usamos la API de DiceBear (estilo "initials")
  // Esto garantiza que el usuario siempre tenga el mismo avatar
  const avatarUrl = `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(username)}`;
  return (
    <div className="avatar-contenedor">
      <img
        src={avatarUrl}
        alt={`Avatar de ${username}`}
        className="avatar-img"
      />
    </div>
  );
};

export default Avatar;