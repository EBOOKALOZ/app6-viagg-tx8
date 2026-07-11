/**
 * SeoManager — metadata dinâmica por rota, alimentada pelo REGISTRO ÚNICO
 * (modules.json). Montado uma vez no App: a cada navegação, casa a rota
 * atual com um módulo do registro e atualiza title, description, canonical
 * e Open Graph — automaticamente, para TODO módulo presente no registro
 * (expansão sem intervenção manual).
 *
 * Rotas privadas (admin/painéis) também ganham title correto na aba, mas
 * seguem bloqueadas no robots.txt — metadata aqui não expõe nada privado.
 */
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import registry from "./modules.json";

const SITE = registry.site;

function setMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(url: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", url);
}

export function SeoManager() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    const full = pathname + search;
    // Casa a rota atual com o módulo mais específico do registro
    const mod = registry.modulos
      .filter((m) => full.startsWith(m.rota.split("?")[0]))
      .sort((a, b) => b.rota.length - a.rota.length)[0];

    const title = mod ? `${mod.nome} | ${SITE.name}` : `${SITE.name} — ${SITE.slogan}`;
    const desc = mod ? mod.oQueE : SITE.descricao;
    const canonical = `${SITE.url}${pathname}`;

    document.title = title;
    setMeta("name", "description", desc);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", desc);
    setMeta("property", "og:url", canonical);
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", desc);
    if (mod?.tags?.length) setMeta("name", "keywords", mod.tags.join(", "));
    setCanonical(canonical);
  }, [pathname, search]);

  return null;
}
