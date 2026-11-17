// ==UserScript==
// @name         LINUX DO 回复滚动助手
// @namespace    local.linux-do.reader
// @version      1.0.1
// @description  在当前话题逐屏滚动，以未读点的变化记录本次浏览进度。
// @match        https://linux.do/*
// @grant        none
// @sandbox      DOM
// @noframes
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  if (document.getElementById('ld-reply-reader')) return;

  const panel = document.createElement('aside');
  panel.id = 'ld-reply-reader';
  panel.style.cssText = 'position:fixed;bottom:16px;left:16px;z-index:1000;max-width:300px;'
    + 'padding:12px;border:1px solid GrayText;border-radius:8px;color:CanvasText;'
    + 'background:Canvas;font:14px/1.4 system-ui;box-shadow:0 3px 12px #0002';
  const label = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'number';
  input.value = '20';
  input.min = '1';
  input.step = '1';
  input.style.width = '80px';
  label.append('本轮目标 ', input);

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = '开始';

  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.style.margin = '6px 0 0';
  status.textContent = '先在话题中定位到未读回复。';
  panel.append(label, ' ', button, status);
  document.body.append(panel);

  const stepInterval = 3000;
  const unreadWait = 9000;
  const topicId = () => {
    const [, section, slug, number] = location.pathname.split('/');
    if (section !== 't') return null;
    return /^\d+$/.test(slug) ? slug : /^\d+$/.test(number) ? number : null;
  };
  let run = null;

  function update(message) {
    status.textContent = message;
  }

  function stop(reason) {
    clearInterval(run.timer);
    update(`${reason}，本页已确认 ${run.total} 条未读点消失。请在 Connect 核对实际增量。`);
    input.disabled = false;
    button.textContent = '开始';
    run = null;
  }

  function tick() {
    if (topicId() !== run.topicId) return stop('已离开话题');
    if (document.hidden || !document.hasFocus()) {
      run.waitingSince = null;
      update('话题页面未聚焦，已暂停滚动。');
      return;
    }

    const viewport = window.innerHeight;
    let visibleUnread = false;
    for (const post of document.querySelectorAll('#topic article[data-post-id]')) {
      const dot = post.querySelector('.read-state');
      if (!dot) continue;
      const id = post.dataset.postId;
      if (dot.classList.contains('read')) {
        if (run.unread.delete(id)) {
          run.counted.add(id);
          run.total += 1;
        }
      } else if (!run.counted.has(id)) {
        run.unread.add(id);
        const top = post.getBoundingClientRect().top;
        visibleUnread ||= top >= 72 && top <= viewport - 96;
      }
    }

    if (run.total >= run.target) return stop('已达到本轮目标');
    update(`本页已确认 ${run.total} / ${run.target} 条 · Esc 停止`);
    const now = performance.now();
    if (now < run.nextScroll) return;
    if (visibleUnread) {
      run.waitingSince ??= now;
      if (now - run.waitingSince >= unreadWait) return stop('可见回复的未读点持续未消失');
      return;
    }
    run.waitingSince = null;

    const scroller = document.scrollingElement;
    const atBottom = scroller.scrollTop + viewport >= scroller.scrollHeight - 2;
    run.bottomChecks = atBottom ? run.bottomChecks + 1 : 0;
    if (run.bottomChecks >= 5) return stop('已到话题底部');

    window.scrollBy({ top: Math.floor(viewport * 0.76), behavior: 'instant' });
    run.nextScroll = now + stepInterval;
  }

  button.addEventListener('click', () => {
    if (run) return stop('已手动停止');

    const id = topicId();
    if (!id || !document.querySelector('#topic article[data-post-id]')) {
      update('请先打开一个话题并等回复加载。');
      return;
    }

    const target = input.valueAsNumber;
    if (!Number.isSafeInteger(target) || target < 1) {
      update('请输入大于零的整数。');
      return;
    }

    run = {
      topicId: id,
      target,
      total: 0,
      bottomChecks: 0,
      waitingSince: null,
      nextScroll: performance.now() + stepInterval,
      unread: new Set(),
      counted: new Set(),
      timer: setInterval(tick, 250),
    };
    input.disabled = true;
    button.textContent = '停止';
    tick();
  });

  document.addEventListener('keydown', (event) => {
    if (run && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      stop('已手动停止');
    }
  }, true);
})();
