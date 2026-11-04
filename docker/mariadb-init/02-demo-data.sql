-- Demo dataset: a small retail business. Deterministic, ~1,200 orders over 24 months.
SET NAMES utf8mb4;
USE demo_sales;

CREATE TABLE IF NOT EXISTS regions (
  id INT PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  country VARCHAR(60) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  segment ENUM('Retail','Wholesale','Online') NOT NULL,
  region_id INT NOT NULL,
  signed_up DATE NOT NULL,
  CONSTRAINT fk_cust_region FOREIGN KEY (region_id) REFERENCES regions(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  category VARCHAR(60) NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  order_date DATETIME NOT NULL,
  status ENUM('pending','paid','shipped','cancelled') NOT NULL,
  channel ENUM('store','web','phone') NOT NULL,
  CONSTRAINT fk_order_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  KEY idx_order_date (order_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  discount_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
  CONSTRAINT fk_item_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_item_product FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB;

INSERT IGNORE INTO regions (id, name, country) VALUES
  (1,'Hà Nội','Việt Nam'), (2,'Hồ Chí Minh','Việt Nam'), (3,'Đà Nẵng','Việt Nam'),
  (4,'Hải Phòng','Việt Nam'), (5,'Cần Thơ','Việt Nam'), (6,'Bangkok','Thailand');

INSERT IGNORE INTO products (id, sku, name, category, unit_price, active) VALUES
  (1,'LAP-001','Laptop 14" Pro','Electronics',21990000,1),
  (2,'LAP-002','Laptop 15" Air','Electronics',17490000,1),
  (3,'PHN-001','Smartphone X','Electronics',12990000,1),
  (4,'ACC-001','USB-C Hub','Accessories',690000,1),
  (5,'ACC-002','Wireless Mouse','Accessories',390000,1),
  (6,'ACC-003','Mechanical Keyboard','Accessories',1590000,1),
  (7,'MON-001','Monitor 27" 4K','Displays',8990000,1),
  (8,'MON-002','Monitor 24" FHD','Displays',3490000,1),
  (9,'SRV-001','Setup service','Services',500000,1),
  (10,'SRV-002','Extended warranty','Services',1200000,1),
  (11,'ACC-004','Laptop Bag','Accessories',450000,0),
  (12,'PHN-002','Smartphone Lite','Electronics',6990000,1);

-- 60 customers, deterministic
INSERT IGNORE INTO customers (id, name, segment, region_id, signed_up)
SELECT n,
       CONCAT('Khách hàng ', LPAD(n, 3, '0')),
       ELT(1 + (n MOD 3), 'Retail','Wholesale','Online'),
       1 + (n MOD 6),
       DATE_ADD('2023-01-01', INTERVAL (n * 7) DAY)
FROM (SELECT a.N + b.N * 10 + 1 AS n
        FROM (SELECT 0 N UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) a,
             (SELECT 0 N UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5) b) seq
WHERE n <= 60;

-- 1,200 orders spread over 24 months with weekly seasonality
INSERT IGNORE INTO orders (id, customer_id, order_date, status, channel)
SELECT n,
       1 + ((n * 7) MOD 60),
       DATE_ADD(DATE_ADD('2024-01-01 08:00:00', INTERVAL ((n * 731) MOD 730) DAY), INTERVAL ((n * 37) MOD 600) MINUTE),
       ELT(1 + (CASE WHEN (n MOD 23) = 0 THEN 3 WHEN (n MOD 5) = 0 THEN 0 WHEN (n MOD 3) = 0 THEN 1 ELSE 2 END), 'pending','paid','shipped','cancelled'),
       ELT(1 + (n MOD 3), 'store','web','phone')
FROM (SELECT a.N + b.N * 10 + c.N * 100 + d.N * 1000 + 1 AS n
        FROM (SELECT 0 N UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) a,
             (SELECT 0 N UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) b,
             (SELECT 0 N UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) c,
             (SELECT 0 N UNION ALL SELECT 1) d) seq
WHERE n <= 1200;

-- 1 to 3 items per order
INSERT IGNORE INTO order_items (order_id, product_id, quantity, unit_price, discount_pct)
SELECT o.id,
       p.id,
       1 + ((o.id + k.k) MOD 4),
       p.unit_price,
       CASE WHEN (o.id MOD 7) = 0 THEN 10.00 WHEN (o.id MOD 11) = 0 THEN 5.00 ELSE 0.00 END
FROM orders o
JOIN (SELECT 0 k UNION ALL SELECT 1 UNION ALL SELECT 2) k ON k.k < 1 + (o.id MOD 3)
JOIN products p ON p.id = 1 + ((o.id * 13 + k.k * 5) MOD 12)
WHERE NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id);

-- A reporting view, handy as a first dataset
CREATE OR REPLACE VIEW v_sales AS
SELECT o.id AS order_id, o.order_date, o.status, o.channel,
       c.name AS customer, c.segment, r.name AS region, r.country,
       p.name AS product, p.category, oi.quantity,
       oi.unit_price, oi.discount_pct,
       ROUND(oi.quantity * oi.unit_price * (1 - oi.discount_pct / 100), 2) AS revenue
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
JOIN customers c ON c.id = o.customer_id
JOIN regions r ON r.id = c.region_id
JOIN products p ON p.id = oi.product_id;
