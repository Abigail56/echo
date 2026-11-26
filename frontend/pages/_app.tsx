import type { AppProps } from 'next/app';
import Head from 'next/head';
import '../styles/globals.css';
import '../styles/command.css';
import '../styles/public-experience.css';
import '../styles/avatar-studio-v3.css';
import '../styles/meeting.css';
import '../styles/live-presence-v4.css';
import '../styles/echo-world-v5.css';
import '../styles/immersive-v6.css';
import '../styles/inbox-v7.css';
import '../styles/memory-v8.css';
import '../styles/chat-history-v9.css';
import '../styles/document-import-v11.css';
import '../styles/knowledge-sources-v12.css';
import '../styles/document-library-v14.css';
import '../styles/knowledge-search-v15.css';
export default function App({ Component, pageProps }: AppProps) {
  return <>
    <Head>
      <title>ECHO — Your presence. Beyond boundaries.</title>
      <meta name="description" content="A personal intelligence layer for human presence, connection and digital identity." />
      <meta name="theme-color" content="#050507" />
      <link rel="icon" href="/echo-mark.svg" type="image/svg+xml" />
    </Head>
    <Component {...pageProps} />
  </>;
}
