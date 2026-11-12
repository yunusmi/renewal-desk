'use strict';
// Core dataset from task.pdf p.2 — exact IDs, dates and amounts. Fictional accounts.

const DEMO_PASSWORD = 'demo1234';
const BCRYPT_COST = 12;

const WORKSPACES = [
  { id: 'alpha', name: 'Alpha' },
  { id: 'beta', name: 'Beta' },
];

const USERS = [
  { id: 'u-ini-a', email: 'initiator.alpha@renewaldesk.test', name: 'Инициатор Alpha', workspace_id: 'alpha', can_initiate: true, can_approve: false },
  { id: 'u-apr-a', email: 'approver.alpha@renewaldesk.test', name: 'Согласующий Alpha', workspace_id: 'alpha', can_initiate: false, can_approve: true },
  { id: 'u-ini-b', email: 'initiator.beta@renewaldesk.test', name: 'Инициатор Beta', workspace_id: 'beta', can_initiate: true, can_approve: false },
  { id: 'u-uni-a', email: 'universal.alpha@renewaldesk.test', name: 'Универсальный Alpha', workspace_id: 'alpha', can_initiate: true, can_approve: true },
];

const RESOURCES = [
  { id: 'res-a-01', workspace_id: 'alpha', name: 'Хранилище A', category: 'Облачные хранилища', expires_on: '2027-03-01', amount_minor: 128000, currency: 'RUB' },
  { id: 'res-a-02', workspace_id: 'alpha', name: 'Сервис B', category: 'Инфраструктурные сервисы', expires_on: '2027-05-20', amount_minor: 250000, currency: 'RUB' },
  { id: 'res-b-01', workspace_id: 'beta', name: 'Сервис C', category: 'Инфраструктурные сервисы', expires_on: '2027-06-01', amount_minor: 150000, currency: 'RUB' },
];

module.exports = { DEMO_PASSWORD, BCRYPT_COST, WORKSPACES, USERS, RESOURCES };
