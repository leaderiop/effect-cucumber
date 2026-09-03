Feature: Checkout

  Scenario: Paying with a saved card
    Given a cart with one item
    When I pay with a saved card
    Then the order is confirmed

  @db
  Scenario: Paying with a card that hits the database
    Given a cart with one item
    When I pay with a card that requires a database lookup
    Then the order is confirmed

  @db @slow
  Scenario: Paying with a slow database-backed card, retried
    Given a cart with one item
    When I pay with a database-backed card under load
    Then the order is confirmed
