import { useEffect, useState } from 'react';
import { onToast } from '../lib/toast';

export function Toast() {
  const [msg, setMsg] = useState('');
  const [show, setShow] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return onToast((m) => {
      setMsg(m);
      setShow(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setShow(false), 3500);
    });
  }, []);

  return (
    <div className={`toast${show ? ' show' : ''}`} id="toast">
      {msg}
    </div>
  );
}
