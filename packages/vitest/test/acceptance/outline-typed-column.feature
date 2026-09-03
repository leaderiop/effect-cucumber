Feature: An Outline column no step pattern references

  @REQ-EC-025
  Scenario Outline: Shipping a typed, unreferenced column
    Given a shipment for "<sku>"
    When the shipment note is decoded from the row
    Then the decoded note and priority match this row's own Examples values

    Examples:
      | sku    | note                      | priority |
      | WIDGET | fragile, handle carefully | 1        |
      | GADGET | standard shipping         | 3        |
