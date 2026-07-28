import React, { useEffect } from 'react';

interface DetailSeoHeadProps {
  property?: any;
  storeInfo?: any;
}

export const DetailSeoHead: React.FC<DetailSeoHeadProps> = ({ property, storeInfo }) => {
  useEffect(() => {
    if (!property) return;

    // Atualiza título da página
    const title = `${property.title || 'Imóvel'} | ${storeInfo?.store_name || 'Viagg-TX8'}`;
    document.title = title;

    // Função auxiliar para atualizar meta tags
    const setMetaTag = (attr: string, key: string, content: string) => {
      let element = document.querySelector(`meta[${attr}="${key}"]`);
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attr, key);
        document.head.appendChild(element);
      }
      element.setAttribute('content', content);
    };

    // SEO Básico
    setMetaTag('name', 'description', property.description?.slice(0, 160) || 'Detalhes do imóvel');
    
    // Open Graph / Facebook / WhatsApp
    setMetaTag('property', 'og:type', 'website');
    setMetaTag('property', 'og:title', title);
    setMetaTag('property', 'og:description', property.description?.slice(0, 160) || '');
    setMetaTag('property', 'og:url', window.location.href);
    if (storeInfo?.store_name) {
      setMetaTag('property', 'og:site_name', `${storeInfo.store_name} | Viagg-TX8`);
    }

    if (property.cover_image || (property.media && property.media[0]?.original_storage_path)) {
      const image = property.cover_image || property.media[0]?.original_storage_path;
      // Tratar URL da imagem aqui, assumindo que getListingImageUrl faria isso.
      // Como estamos no head, usamos um try-catch silencioso
      setMetaTag('property', 'og:image', image);
    }

    // Twitter
    setMetaTag('name', 'twitter:card', 'summary_large_image');
    setMetaTag('name', 'twitter:title', title);
    setMetaTag('name', 'twitter:description', property.description?.slice(0, 160) || '');

  }, [property, storeInfo]);

  return null;
};
