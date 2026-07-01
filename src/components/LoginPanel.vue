<template>
  <div class="login-panel">
    <!-- Logged in: show profile -->
    <div v-if="accountStore.isLoggedIn" class="profile-section">
      <div class="profile-avatar">{{ accountStore.user?.avatar }}</div>
      <div class="profile-info">
        <div class="profile-name">{{ accountStore.user?.name }}</div>
        <div class="profile-email">{{ accountStore.user?.email }}</div>
      </div>
      <button class="logout-btn" @click="accountStore.logout()">退出登录</button>
    </div>

    <!-- Not logged in: show login/register -->
    <div v-else>
      <div class="auth-tabs">
        <button :class="{ active: mode === 'login' }" @click="mode = 'login'; error = ''">登录</button>
        <button :class="{ active: mode === 'register' }" @click="mode = 'register'; error = ''">注册</button>
      </div>

      <div v-if="error" class="auth-error">{{ error }}</div>

      <!-- Login form -->
      <div v-if="mode === 'login'" class="auth-form">
        <label>邮箱</label>
        <input v-model="email" type="email" placeholder="your@email.com" />
        <label>密码</label>
        <input v-model="password" type="password" placeholder="输入密码" @keydown.enter="handleLogin" />
        <button class="auth-btn" @click="handleLogin">登录</button>
      </div>

      <!-- Register form -->
      <div v-else class="auth-form">
        <label>名称</label>
        <input v-model="regName" type="text" placeholder="你的名字" />
        <label>邮箱</label>
        <input v-model="regEmail" type="email" placeholder="your@email.com" />
        <label>密码</label>
        <input v-model="regPassword" type="password" placeholder="设置密码 (至少4位)" @keydown.enter="handleRegister" />
        <button class="auth-btn" @click="handleRegister">注册</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useAccountStore } from '../stores/account';

const accountStore = useAccountStore();

const mode = ref<'login' | 'register'>('login');
const error = ref('');

// Login fields
const email = ref('');
const password = ref('');

// Register fields
const regName = ref('');
const regEmail = ref('');
const regPassword = ref('');

function handleLogin() {
  error.value = '';
  const result = accountStore.login(email.value, password.value);
  if (!result.ok) {
    error.value = result.error || '登录失败';
  } else {
    email.value = '';
    password.value = '';
  }
}

function handleRegister() {
  error.value = '';
  const result = accountStore.register(regName.value, regEmail.value, regPassword.value);
  if (!result.ok) {
    error.value = result.error || '注册失败';
  } else {
    regName.value = '';
    regEmail.value = '';
    regPassword.value = '';
  }
}
</script>

<style scoped>
.login-panel {
  padding: 16px;
}
.profile-section {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--border-light);
  border-radius: 8px;
}
.profile-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--jade);
  color: var(--bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 600;
  flex-shrink: 0;
}
.profile-info {
  flex: 1;
  min-width: 0;
}
.profile-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--bone);
}
.profile-email {
  font-size: var(--text-sm);
  color: var(--silver);
  overflow: hidden;
  text-overflow: ellipsis;
}
.logout-btn {
  padding: 6px 14px;
  border: 1px solid rgba(255,80,80,0.3);
  border-radius: 6px;
  background: rgba(255,80,80,0.1);
  color: var(--vermilion-glow, #ff5050);
  font-size: var(--text-sm);
  cursor: pointer;
  flex-shrink: 0;
}
.logout-btn:hover {
  background: rgba(255,80,80,0.2);
}

.auth-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
}
.auth-tabs button {
  flex: 1;
  padding: 8px;
  border: 1px solid var(--border-light);
  border-radius: 6px;
  background: transparent;
  color: var(--bone-dim);
  font-size: var(--text-base);
  cursor: pointer;
  transition: all 0.2s;
}
.auth-tabs button.active {
  border-color: var(--jade);
  color: var(--jade);
}
.auth-error {
  padding: 8px 12px;
  margin-bottom: 12px;
  background: rgba(255,80,80,0.1);
  border: 1px solid rgba(255,80,80,0.2);
  border-radius: 6px;
  color: var(--vermilion-glow, #ff5050);
  font-size: var(--text-sm);
}
.auth-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.auth-form label {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--silver);
}
.auth-form input {
  padding: 8px 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: 6px;
  color: var(--bone);
  font-size: var(--text-base);
  outline: none;
  transition: border-color 0.2s;
}
.auth-form input:focus {
  border-color: var(--jade);
}
.auth-btn {
  margin-top: 8px;
  padding: 8px;
  background: var(--jade-deep);
  border: none;
  border-radius: 6px;
  color: var(--bg-primary);
  font-size: var(--text-base);
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}
.auth-btn:hover {
  background: var(--jade);
}
</style>
